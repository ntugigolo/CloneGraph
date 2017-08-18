require 'active_support/core_ext'
class AlarmSettingController < ApplicationController

    def is_number(n)
        return n.to_f.to_s == n.to_s;
    end

    def setting
        new_setting = (params[:commit]=="Update Daily Alarm") ? get_store_setting() : get_store_cross_threshold_setting();

        new_setting["alarm_setting"].each do |key,value|
            value["threshold"].each do |k,v|
            # Modify machine threshold
                if params[k] != "" and is_number(params[k].to_f)
                    new_setting["alarm_setting"][key]["threshold"][k] = params[k].to_f;
                end
            end
            product = key.split("_")[0]
            # Modify studio condition threshold
            if params[product+'_studio_condition'] != "" and is_number(params[product+'_studio_condition'].to_f)
                new_setting["alarm_setting"][key]["condition_below_avg"] = params[product+'_studio_condition'].to_f
            end
            # Modify overall condition threshold
            if params[product+'_machine_condition'] != "" and is_number(params[product+'_machine_condition'].to_f)
                new_setting["alarm_setting"][key]["condition"] = params[product+'_machine_condition'].to_f
            end
        end
        save_setting(new_setting,params[:commit]);
        redirect_to :back
    end	
    # Add new studio, contact mail address to DB. Can also change timeout, attempts threshold setting. 
    def db_setting_update
        emergency_setting = get_store_cross_threshold_setting();
        new_setting = get_store_setting();

        if params[:Studio] != ""
            new_setting["alarm_setting"].each do |key,value|
                # Append new studio to alarm setting.
                new_setting["alarm_setting"][key]["machine_studio"].each do |k,v|
                    new_setting["alarm_setting"][key]["machine_studio"][k] = new_setting["alarm_setting"][key]["machine_studio"][k].to_set.add(params[:Studio]).to_a
                end
            end
            emergency_setting["alarm_setting"] = new_setting["alarm_setting"]
        end
        if params[:MailAddress] != ""
            new_setting["mail_list"] = new_setting["mail_list"].to_set.add(params[:MailAddress]).to_a
        end
        if params[:DeleteMailAddress] != ""
            new_setting["mail_list"].delete_if {|x| x == params[:DeleteMailAddress]}
        end
        if params[:RecoveryDays] != "" and is_number(params[:RecoveryDays].to_f)
            emergency_setting["recovery"] = params[:RecoveryDays];
        end
        if params[:AttemptsThreshold] != "" and is_number(params[:AttemptsThreshold].to_f)
            emergency_setting["attemptsThreshold"] = params[:AttemptsThreshold];
        end
        save_setting(new_setting,"Update Daily Alarm");
        save_setting(emergency_setting,"Update Emergency Alarm");
        redirect_to :back
    end

    def check_email_in_db

        exist = false;
        setting = get_store_setting();

        for i in 0..setting["mail_list"].size-1
            if setting["mail_list"][i] == params[:deleteMailAddress]
                exist = true;
            end
        end
        @msg = (exist==true) ? "This address exist" : "This address does not exist in the database";
        return @msg;  
    end

    def daily_alarm_report
        period = "OneHour"
        period_value = @@day;
        start_num_days = 7;
        reports = {};
        setting = get_store_setting();
        setting["alarm_setting"].each do |key, value|
            value["machine_studio"].each do |k,v|                    
                result = get_alarm(k,value["threshold"][k],value["product"],period,period_value,start_num_days,"machine",nil,value["condition"],0)
                reports[k+" "+value["product"]] = [result];
                for i in 0..v.size-1
                    result_studio = get_alarm(k,result["Success Rate"],value["product"],period,period_value,start_num_days,"studio",v[i],value["condition_below_avg"],result["Total"])
                    reports[k+" "+value["product"]].push(result_studio)
                end
            end
        end
        mail_body = get_table(reports,"daily")
        subject = "Auto Retouch Status for "+(Time.now).gmtime.strftime("%Y-%m-%d");
        sending_mail(mail_body, subject)
    end

    def cross_threshold_alarm_report
        period = "OneHour"
        period_value = @@day;
        start_num_days = 7;
        reports = {};
        setting = get_store_cross_threshold_setting();
        setting["alarm_setting"].each do |key, value|
            value["machine_studio"].each do |k,v|                    
                result = get_alarm(k,value["threshold"][k],value["product"],period,period_value,start_num_days,"machine",nil,value["condition"],0)
                reports[k+" "+value["product"]] = [result];
                for i in 0..v.size-1
                    result_studio = get_alarm(k,result["Success Rate"],value["product"],period,period_value,start_num_days,"studio",v[i],value["condition_below_avg"],result["Total"])
                    reports[k+" "+value["product"]].push(result_studio)
                end
            end
        end
        mail_body = get_table(reports,"emergency")
        if mail_body == ""
            return nil;
        else
            subject = "Emergency Auto Retouch Status for "+(Time.now).gmtime.strftime("%Y-%m-%d-%H:%M");
            send_mail_SNS(mail_body,subject);
        end
    end

    def get_alarm(machine_name,threshold,product,period,period_value,start_num_days,type,studio_name,condition, total_vol)    
        weight = 0.5;
        start_duration = start_num_days * @@day + 0 * @@hour;
        time_interval = (( start_duration) / period_value.to_f).ceil;  
        metricName_list = get_metrics_string(machine_name,product,type,studio_name);
        startTime = (Time.now - start_duration).gmtime.strftime("%Y-%m-%dT%H:%M:00Z");
        endTime = (Time.now).gmtime.strftime("%Y-%m-%dT%H:%M:00Z");

        datapoint = get_datapoint(metricName_list,period,startTime,endTime);
        datapoints = fill_histogram(time_interval,0,start_duration,datapoint,period_value,weight);
        avg_datapoints = (get_avg(datapoints)!=nil) ? (get_avg(datapoints).to_s) : "N/A";
        color = get_alarm_color(avg_datapoints,threshold,condition);
        total = (studio_name==nil) ? get_volume(datapoints) : total_vol;
        numerator = get_volume(datapoints);
        shares = (numerator!="" and total!="") ? ((numerator*100/total.to_f).round(1)).to_s : "";

        field = (type == "machine") ? ((product == "apparel") ? "Apparel" : ((product=="books") ? "Books and Media" : get_font_style(product+ " "+ machine_name))) : (studio_name);   
        result = {
            "Field" => field,
            "Success Rate" => avg_datapoints,
            "color" => color,
            "Shares" => shares,
            "Total" => numerator.to_s,
            "Time" => Time.now.to_s
        }
        return result;
    end

    def get_alarm_color(avg_datapoints,threshold,condition)
    	color = "";
    	if avg_datapoints == "N/A"
    		color = "gray"
    	elsif threshold.to_f-condition.to_f > avg_datapoints.to_f
    		color = "red"
    	else
    		color = "green"
    	end	
    	return color;
    end

    def get_table_head_html
        html = File.open('app/views/index/email_html_head.erb').read;
        head_html = ERB.new(html);
        return head_html.result;
    end

    def get_table(reports,type)
    	html_upper = "<html>" + get_table_head_html();
		      
		html_down = "</html>"
        if type == "daily"
		  tables = get_daily_table_body(reports)
		  return html_upper+tables+html_down;
        elsif type == "emergency"
          tables = get_emergency_sns_body(reports)
          html_content = tables;
          return html_content; 
        end
    end

    def get_font_style(str)
    	if str == nil
    		return "";
    	end
    	product = str.split(' ')[0].split(/ |\_|\-/).map(&:capitalize).join(" ");
    	machine = str.split(' ')[1].upcase;
    	return product+" "+machine;
    end

    def get_daily_table_body(reports)
    	row = ""
    	rows = ""
    	tr_start = "<tr><td><p>";
    	tr_end = "</p></td></tr>";
        thead = "<table class='Table'>" + get_thead_html()+"<tbody>"

        tcaption_start = "<caption><font size='4'><b>";        
        tcaption_end = "</b></font></caption>"

        row = add_shoes_overall(reports);

    	reports.each do |key,value|
            value = value.sort_by { |x| [x["Total"].to_i,x["Field"]]}.reverse
    		row += thead
    		for i in 0..value.size-1
    			if i == 0
                    tcaption = tcaption_start + value[i]["Field"] + tcaption_end;
                    row += tcaption;
    				row += tr_start+ "<strong>"+"Overall"+"</strong></p></td>";
    				row += "<td><p style=color:"+value[i]["color"]+";>"+"<strong>"+ value[i]["Success Rate"] +"</strong>";
                    row += "<td><p><strong>"+ value[i]["Total"]+"</strong></p></td>" ;
                    row += "<td><p>"+tr_end;
    			else
    				row += tr_start+ (value[i]["Field"])+"</p></td>"
    				row += "<td><p style=color:" +value[i]["color"]+";>"+ value[i]["Success Rate"];
                    row += "<td><p>"+ value[i]["Total"]+"</p></td>" ;
                    row += "<td><p>"+ value[i]["Shares"] +tr_end;
    			end
    		end
    		row += "</tbody></table><br>";
    		rows += row;
    		row = "";
    	end
    	return rows;
    end
    # Add overall shoes success rate in report 
    def add_shoes_overall(reports)
        row = "";
        tr_start = "<tr><td><p>";
        tr_end = "</p></td></tr>";
        thead = "<table class='Table'>" + get_thead_html()+"<tbody>";
        sum_attempt = 0;
        num_success = 0;

        tcaption_start = "<caption><font size='4'><b>";        
        tcaption_end = "</b></font></caption>";
        row += thead;
        reports.each do |key,value|
            value = value.sort_by { |x| [x["Total"].to_i,x["Field"]]}.reverse
            if value[0]["Field"] != "Books and Media" and value[0]["Field"] != "Apparel"
                num_success += value[0]["Success Rate"].to_f*value[0]["Total"].to_i;
                sum_attempt += value[0]["Total"].to_i;
            end
        end
        avg_datapoints = (sum_attempt>0) ? (num_success/sum_attempt).round(1).to_s : "N/A";
        threshold = 80;
        condition = 0;
        color = get_alarm_color(avg_datapoints,threshold,condition)
        tcaption = tcaption_start + "Shoes Total" + tcaption_end;
        row += tcaption;
        row += tr_start+ "<strong>"+"Overall"+"</strong></p></td>";
        row += "<td><p style=color:"+color+";>"+"<strong>"+ avg_datapoints +"</strong>";
        row += "<td><p><strong>"+ sum_attempt.to_s+"</strong></p></td>" ;
        row += "<td><p>"+tr_end;
        row += "</tbody></table><br>";
        return row;
    end

    def get_thead_html
        html = File.open('app/views/index/email_html_thead.erb').read;
        thead_html = ERB.new(html);
        return thead_html.result;
    end	

    def get_emergency_table_body(reports)
        row = "";
        rows = "";
        tr_start = "<tr><td><p>";
        tr_end = "</p></td></tr>";
        thead = "<table class='Table'>" + get_thead_html()+"<tbody>";
        tcaption_start = "<caption><font size='4'><b>";        
        tcaption_end = "</b></font></caption>";

        setting_alarm_list = update_alarm_status(reports);
        if setting_alarm_list.size <= 0
            return "";
        end

        reports.each do |key,value|
            value = value.sort_by { |x| [x["Total"].to_i,x["Field"]]}.reverse
            for i in 0..value.size-1
                target_studio = (key+" "+value[i]["Field"]);
                if i == 0
                    tcaption = tcaption_start + value[i]["Field"] + tcaption_end;
                    if setting_alarm_list.include? target_studio
                        row += tr_start+ "<strong>"+"Overall"+"</strong></p></td>";
                        row += "<td><p style=color:"+value[i]["color"]+";>"+"<strong>"+ value[i]["Success Rate"] +"</strong>";
                        row += "<td><p><strong>"+ value[i]["Total"]+"</strong></p></td>";
                        row += "<td><p>"+tr_end;
                    end
                elsif setting_alarm_list.include? target_studio
                    row += tr_start+ (value[i]["Field"])+"</p></td>";
                    row += "<td><p style=color:" +value[i]["color"]+";>"+ value[i]["Success Rate"];
                    row += "<td><p>"+ value[i]["Total"]+"</p></td>" ;
                    row += "<td><p>"+ value[i]["Shares"] +tr_end;
                end
            end
            row = (row != "") ? (thead + tcaption+ row + "</tbody></table><br>") : "";
            rows += row;
            row = "";
        end
        return rows;
    end

    def get_emergency_sns_body(reports)
        row = "";
        rows = "";

        setting_alarm_list = update_alarm_status(reports);
        if setting_alarm_list.size <= 0
            return "";
        end

        reports.each do |key,value|
            value = value.sort_by { |x| [x["Total"].to_i,x["Field"]]}.reverse
            for i in 0..value.size-1
                target_studio = (key+" "+value[i]["Field"]);
                if i == 0
                    tcaption = value[i]["Field"];
                    if setting_alarm_list.include? target_studio
                        row += tcaption;
                        row += " Worldwide" + " / ";
                        row += value[i]["Success Rate"] + " / ";
                        row += "Volume: "+value[i]["Total"] + "\n";
                    end
                elsif setting_alarm_list.include? target_studio
                    row += tcaption;
                    row += " "+value[i]["Field"] + " / ";
                    row += value[i]["Success Rate"] + " / ";
                    row += "Volume: "+value[i]["Total"] + "\n";
                end
            end
            rows += row;
            row = "";
        end
        return rows;
    end

    def update_alarm_status(reports)
        remove_recovery();
        set = get_store_cross_threshold_setting();
        setting_alarm_list = [];

        reports.each do |key,value|
            for i in 0..value.size-1
                target_studio = (key+" "+value[i]["Field"]);
                if set["studio_list"] == nil
                    set["studio_list"] = {};
                end
                # Alarm status already exist, skip.
                if (set["studio_list"].has_key? target_studio) and value[i]["color"]== "red" 
                    next;
                elsif (set["studio_list"].has_key? target_studio) and value[i]["color"]== "green"
                    # Recovery status alredy exist and not expired, skip.
                    if set["studio_list"][target_studio]["status"] == "recovery"
                        next;
                    # Turn to recovery status  
                    else
                        set["studio_list"][target_studio]["status"] = "recovery";
                        set["studio_list"][target_studio]["date"] = value[i]["Time"];
                    end
                # Studio not in list yet, add it to alarm status.
                elsif !(set["studio_list"].has_key? target_studio) and value[i]["color"]== "red" and value[i]["Total"].to_i > set["attemptsThreshold"].to_i
                        sub_set = {"status" => "alarm", "date" => value[i]["Time"]};
                        set["studio_list"][target_studio] = sub_set;
                        setting_alarm_list.push(target_studio);
                end
            end
        end
        save_setting(set,"Update Emergency Alarm");
        return setting_alarm_list;
    end 

    def remove_recovery
        set = get_store_cross_threshold_setting();
        recovery_time = set["recovery"].to_i * @@day;
        set_hash = set["studio_list"];
        if set_hash != nil
            set_hash.each do |k,v|
                if v["status"] == "recovery" and (Time.now-recovery_time>=Time.parse(v["date"]))
                    set_hash.delete(k);
                end
            end
        end
        set["studio_list"] = set_hash;
        save_setting(set,"Update Emergency Alarm");
    end

    def get_table_data

        @result = {};
        daily_alarm = get_store_setting();
        emergency_alarm = get_store_cross_threshold_setting();

        setting = (params[:type]=="daily") ? daily_alarm : emergency_alarm;
        setting["alarm_setting"].each do |key,value|
            product = key.split("_")[0];
            machine_cond = product+"_machine_condition";
            studio_cond = product+"_studio_condition";
            @result[machine_cond] = value["condition"];
            @result[studio_cond] = value["condition_below_avg"];
            value["threshold"].each do |k,v|
                @result[k] = v;
            end
        end
        @result["RecoveryDays"] = emergency_alarm["recovery"];
        @result["AttemptsThreshold"] = emergency_alarm["attemptsThreshold"];

        return @result.to_json; 
    end
end