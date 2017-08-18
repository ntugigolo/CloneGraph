require 'active_support'
require 'active_support/core_ext'
#require "application_controller"
require 'amazon/odin'
require 'mysql2'

require 'active_support/all'
require 'aws-sdk-resources'
require 'nokogiri'
require 'open-uri'
require 'json'
require 'mail'
#require 'amazon/rails_logger'

require 'amazon/MWSAuth.rb'

require 'mws/mws_common'
require 'mws/mws_metrics_publisher'
require "action_controller/railtie"
require "action_mailer/railtie"
require "sprockets/railtie"
require 'rails/all' # Add for rake db:
require "rails/test_unit/railtie"
require 'rails'
class AlarmReportController

    # Time Variable
    @@hour = 60 * 60;
    @@day = @@hour * 24; 

    def self.daily_alarm_report
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

    def self.get_store_setting
        setting_par = {};
        db = open_rds_db();
        result = db.query("SELECT * FROM autoretouch.Alarm_Setting");
        result.each do |row|
            setting_par = {
                "alarm_setting" =>eval(row["alarm_setting"]),
                "mail_list" => row["mail_list"].gsub!(/[\[\]]/,'').split(/\s*,\s*/)
            }
        end
        db.close();
        return setting_par;
    end

    def self.open_rds_db
        material_set_name = 'com.amazon.imagingsciences.autoretouchdashboard.aurora.credentials'
        host_name = 'autoretouchcustomdashboard-cluster.cluster-ctnezafsf8fr.us-west-2.rds.amazonaws.com'

        material_pair = Amazon::Odin.retrieve_pair(material_set_name, 1)
        db_username = material_pair.public.text
        db_password = material_pair.private.text

        return Mysql2::Client.new(
            host: host_name,
            port: 3306,
            username: db_username,
            password: db_password,
            secure_auth: true);
    end

    def self.get_metrics_string(machine_name,product,type,studio_name)
      base_prefix = "GRAPH-studio_global_";
      base_suffix = "";
      if type=="machine"
        base_suffix = "_retouch_v1.RESULT-";
      elsif type == "studio"
        base_suffix = "_retouch_v1.STUDIO-" + studio_name;
        base_suffix += ".RESULT-";
      end
      verdicts = product=="apparel" ? ["ACCEPT","PARTIAL_RESULT","NO_RESULT","REJECT"] : ["ACCEPT","PARTIAL_RESULT","NO_RESULT","REJECT","ERROR"];
      base_prefix += product + "_";

      metricsname_list = [];
      for j in 0..verdicts.size-1
        metricsname_list.push(base_prefix+machine_name+base_suffix+verdicts[j]);
      end
      return metricsname_list;
    end

    def self.get_datapoint(metricName_list,period,startTime,endTime)
        response = []
        for i in 0..metricName_list.size-1
          return_response = get_pmet_response(metricName_list[i],period,startTime,endTime);
          response.push(return_response);
        end
        hashlist = xml_to_hash(response);
        datapoint = [];
        for i in 0..hashlist.size-1
          if hashlist[i] != nil
              hashlist[i].each do |k,v|
                  datapoint.push(v["StatisticSeries"]["Datapoint"])
              end
          else
              datapoint.push(nil)
          end
        end
      return datapoint;
    end

    def self.get_pmet_response(metric_name,period, startTime, endTime)

        material_set = 'com.amazon.access.AISMetricsAWS-AutoRetouchTest-2';
        publickey = Amazon::Odin.retrieve_material(material_set, 'Principal').text;
        privatekey = Amazon::Odin.retrieve_material(material_set, 'Credential').text;
        mws_region_endpoint = "http://monitor-api-pdx.amazon.com";
        aws_public_region = "us-west-2";
        serviceName = "ImagingWorkflowService";

        opt = {
                :dataset => "Prod",
                :stat => "n",
                :marketplace => "internal.amazon.com",
                :start_time => startTime,
                :end_time => endTime
            }
        begin
            mws_publisher = MWS::MwsMetricsPublisher.new(:access_key_id => publickey ,
                                                         :secret_access_key => privatekey,
                                                         :mws_endpoint => mws_region_endpoint,
                                                         :aws_public_region => aws_public_region);
            response = "<root>" + mws_publisher.get_metric_data(metric_name,period,serviceName,opt) + "</root>";

        rescue MWS::MwsException => e
            puts e.message
            return nil
        end

        return response
    end

    def self.xml_to_hash(response)
        hash_list = []
        for i in 0..response.size-1
            if response[i] == nil
                hash_list.push(nil)
            else
                doc = Nokogiri::XML(response[i])
                hash = Hash.from_xml(doc.to_s)
                hash_list.push(hash)
            end
        end
        return hash_list
    end

    def self.fill_histogram(time_interval,end_duration,duration,datapoint,period_value,weight)
        datapoints = []

        for i in 0..time_interval-1
            low = (Time.now - end_duration - duration).gmtime.strftime("%Y-%m-%dT%H:%M:00Z");
            high = (Time.now - end_duration - duration + period_value).gmtime.strftime("%Y-%m-%dT%H:%M:00Z");
            count = [0,0,0,0,0];

            for j in 0..datapoint.size-1
                verdict_idx = j%5;
                if datapoint[j] != nil
                    for k in 0..datapoint[j].size-1
                        if datapoint[j][k] != nil and low <= datapoint[j][k]["StartTime"] and datapoint[j][k]["StartTime"] <= high
                            count[verdict_idx] = count[verdict_idx] + datapoint[j][k]["Val"].to_i
                        end
                    end
                else
                    count[verdict_idx] = 0;
                end
            end
            sub_datapoints = get_successrate(count,weight,low);
            datapoints.push(sub_datapoints);
            duration = duration - period_value;
        end
        return datapoints;
    end

    def self.get_successrate(count,weight,time)
        sub_datapoints = [];

        denominator = count.inject(0, :+);
        if denominator > 0
            success_rate = (weight  * count[1] + count[0])/denominator*100;
            sub_datapoints = {"StartTime"=>time, "Val"=>success_rate, "Total"=>denominator};
        else
            sub_datapoints = {"StartTime"=>time, "Val"=>nil,"Total"=>0};
        end
        return sub_datapoints;
    end

    def self.get_store_cross_threshold_setting
        setting_par = {};
        db = open_rds_db();
        result = db.query("SELECT * FROM autoretouch.Cross_Threshold_Alarm_Setting");
        result.each do |row|
            setting_par = {
                "alarm_setting" =>eval(row["alarm_setting"]),
                "studio_list" => eval(row["studio_list"]),
                "recovery" => row["recovery"],
                "attemptsThreshold" => row["attemptsThreshold"]
            }
        end
        db.close();
        return setting_par;
    end

    def self.send_mail_SNS(reports, subject)
        Aws.use_bundled_cert!

        material_set = 'com.amazon.access.AISMetricsAWS-AutoRetouchTest-2';
        publickey = Amazon::Odin.retrieve_material(material_set, 'Principal').text;
        privatekey = Amazon::Odin.retrieve_material(material_set, 'Credential').text;
        aws_public_region = "us-west-2";

        sns_client = Aws::SNS::Client.new(
          region: aws_public_region,
          access_key_id: publickey,
          secret_access_key: privatekey
        )
        sns_client.publish({
          topic_arn:"arn:aws:sns:us-west-2:000605915062:Emergency_Auto_Retouch_Status",
          message: reports, # required
          subject: subject,
          message_structure: "messageStructure"
        })
    end

    def self.save_setting(data,type)
        if type == "Update Daily Alarm"
            db = open_rds_db();
            db.query("UPDATE autoretouch.Alarm_Setting SET alarm_setting ='"+data["alarm_setting"].to_s+"'"+",mail_list='"+ data["mail_list"].to_s.gsub('"', '')+"'");
            db.close();
        else
            db = open_rds_db();
            db.query("UPDATE autoretouch.Cross_Threshold_Alarm_Setting SET alarm_setting ='"+ data["alarm_setting"].to_s+"'"\
                     +",studio_list='"+ data["studio_list"].to_s+"'"\
                     +",recovery='"+data["recovery"].to_s+"'"\
                     +",attemptsThreshold='"+data["attemptsThreshold"].to_s+"'");
            db.close();
        end
    end

    def self.get_avg(datapoints)
        sum = 0;
        len = 0;
        for i in 0..datapoints.size-1
          if datapoints[i]["Val"] != nil
            sum += datapoints[i]["Val"];
            len += 1;
          end
        end
        avg = len!=0?((sum/len).round(1)):nil;
        return avg;
    end

    def self.get_volume(datapoints)
        sum = 0;
        for i in 0..datapoints.size-1
          if datapoints[i]["Total"] != nil
            sum += datapoints[i]["Total"];
          end
        end
        sum = sum != 0 ? sum : "";
        return sum;
    end

    def self.sending_mail(reports, subject)
      mail_list = get_store_setting()["mail_list"]
      root = Rails.root.to_s;
          mail = Mail.new do
            from 'no-reply@amazon.com'
            to mail_list
            subject subject
            html_part do
              content_type 'text/html; charset=UTF-8'
              body reports
            end
            text_part do
              body reports
            end
          end
          mail.delivery_method :sendmail
          mail.deliver
    end

    def self.cross_threshold_alarm_report
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

    def self.get_alarm(machine_name,threshold,product,period,period_value,start_num_days,type,studio_name,condition, total_vol)
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

    def self.get_alarm_color(avg_datapoints,threshold,condition)
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

    def self.get_table_head_html
        html = File.open('/apollo/env/AutoRetouchCustomDashboard/rails-root/app/views/index/email_html_head.erb').read;
        head_html = ERB.new(html);
        return head_html.result;
    end

    def self.get_table(reports,type)
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

    def self.get_font_style(str)
        if str == nil
                return "";
        end
        product = str.split(' ')[0].split(/ |\_|\-/).map(&:capitalize).join(" ");
        machine = str.split(' ')[1].upcase;
        return product+" "+machine;
    end

    def self.get_daily_table_body(reports)
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
    def self.add_shoes_overall(reports)
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

    def self.get_thead_html
        #html = File.open('app/views/index/email_html_thead.erb').read;
        #thead_html = ERB.new(html);
        #return thead_html.result;
        return "<thead>
    <tr>
        <th><font size='4'>Studio</font></th>
        <th><font size='4'>Success Rate</font></th>
        <th><font size='4'>Attempts</font></th>
        <th><font size='4'>% of Total</font></th>
    </tr>
</thead>"
    end

    def self.get_emergency_table_body(reports)
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

    def self.get_emergency_sns_body(reports)
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

    def self.update_alarm_status(reports)
        remove_recovery();
        set = get_store_cross_threshold_setting();
        setting_alarm_list = [];

        reports.each do |key,value|
            for i in 0..value.size-1
                target_studio = (key+" "+value[i]["Field"]);
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

    def self.remove_recovery
        set = get_store_cross_threshold_setting();
        recovery_time = set["recovery"].to_i * @@day;
        set_hash = set["studio_list"];
        set_hash.each do |k,v|
            if v["status"] == "recovery" and (Time.now-recovery_time>=Time.parse(v["date"]))
                set_hash.delete(k);
            end
        end
        set["studio_list"] = set_hash;
        save_setting(set,"Update Emergency Alarm");
    end

    def self.get_table_data

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