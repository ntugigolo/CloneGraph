require 'mysql2'

require 'active_support/all'
require 'aws-sdk-resources'
require 'nokogiri'
require 'open-uri'
require 'json'
require 'mail'

class ApplicationController < ActionController::Base

    protect_from_forgery
    before_filter :initialize_remote_user
    before_filter :set_cache_headers

    # Time Variable
    @@hour = 60 * 60;
    @@day = @@hour * 24;    
    #
    # Set @remote_user from Kerberos credentials
    #
    def initialize_remote_user 
        if request.env['REMOTE_USER']
            @remote_user = request.env['REMOTE_USER'].chomp('@ANT.AMAZON.COM')
        else
             # For testing in workspace without Kerberos
            @remote_user = ENV['REMOTE_USER']
        end
        return @remote_user
    end

    # See https://w.amazon.com/index.php/RailsCSRFAndKerberos for more information
    def handle_unverified_request
        super
        render :text => "Forgery protection token was not present.", :status => :unauthorized
    end
    
    #
    # Prevent browser-caching
    #
    def set_cache_headers
        response.headers["Cache-Control"] = "no-cache, no-store, max-age=0, must-revalidate, pre-check=0, post-check=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "Fri, 01 Jan 1990 00:00:00 GMT"
        # response.headers["Last-Modified"] = Time.now.httpdatecccbc
    end

    def is_permission_user
        db = open_rds_db();
        result = db.query("SELECT * FROM autoretouch.Permission_List where user='" + @remote_user + "'");
        db.close();
        if (result.count == 1)
            return true;
        end
        return false;  
    end
    helper_method :is_permission_user

    def sending_mail(reports, subject)
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

    def send_mail_SNS(reports, subject)
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

    def get_pmet_response(metric_name,period, startTime, endTime)

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

    def open_rds_db
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

    def xml_to_hash(response)
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

    def fill_histogram(time_interval,end_duration,duration,datapoint,period_value,weight)
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

    def get_successrate(count,weight,time)
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
    # Index:
    # [0] Accept [1] PARTIAL_RESULT [2] NO_RESULT [3] ERROR [4] REJECT
    def get_metrics_string(machine_name,product,type,studio_name)
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

    def get_metrics_data
        weight = params[:parList]["weightValue"].to_f
        period_value = 0;

        if params[:period] == "OneHour"
            period_value = @@hour;
        elsif params[:period] == "OneDay"
            period_value = @@day;
        elsif params[:period] == "OneWeek"
            period_value = @@day*7;
        end

        time_interval = (( params[:startDuration].to_i -  params[:endDuration].to_i) / period_value.to_f).ceil;
        duration = params[:startDuration].to_i - params[:endDuration].to_i;
        # Determine metrics name
        if params[:studioName] == "N/A"
            metricName_list = get_metrics_string(params[:machineName],params[:product],"machine",nil);
        else
            metricName_list = get_metrics_string(params[:machineName],params[:product],"studio",params[:studioName]);
        end
        # Determine threshold
        if params[:studioName] == "N/A"
            threshold = get_store_setting()["alarm_setting"][params[:product]+"_alarm_par"]["threshold"][params[:machineName]];
        else
            metric_machine = get_metrics_string(params[:machineName],params[:product],"machine",nil);
            datapoint = get_datapoint(metric_machine,params[:period],params[:startTime], params[:endTime])
            datapoint_fill = fill_histogram(time_interval,params[:endDuration].to_i,duration,datapoint,period_value,weight);
            threshold = get_avg(datapoint_fill).to_s
        end
        # Determine threshold condition
        if params[:studioName] == "N/A"
            condition = get_store_setting()["alarm_setting"][params[:product]+"_alarm_par"]["condition"];
        else
            condition = get_store_setting()["alarm_setting"][params[:product]+"_alarm_par"]["condition_below_avg"];
        end

        datapoint = get_datapoint(metricName_list,params[:period],params[:startTime], params[:endTime])
        datapoint_fill = fill_histogram(time_interval,params[:endDuration].to_i,duration,datapoint,period_value,weight);
        datapoints_tune = tune_sliding_widow(datapoint_fill);
        datapoints = datapoints_tune.to_json;

        @metrics_data = {
            "datapoints" => datapoints,
            "threshold" => threshold,
            "condition" => condition
        }

        return @metrics_data.to_json; 
    end

    def get_studio_list
        product = params[:product];
        machine_name = params[:machineName];
        key = product + "_alarm_par";
        setting = get_store_setting();
        @studio_list = setting["alarm_setting"][key]["machine_studio"][machine_name];
        return @studio_list;
    end

    # Smooth data by setting local average data points(default by 1).
    def tune_sliding_widow(datapoints)

        window_value = params[:parList]["windowValue"].to_i > 0 ? params[:parList]["windowValue"].to_i : 1;
        st_time, st_val = [],[];
        moving_sum, count = 0, 0;
        datapoints_tune = []

        for k in 0..datapoints.size-1
            if count < window_value and datapoints[k]["Val"] != nil
                moving_sum += datapoints[k]["Val"]
                st_time << datapoints[k]["StartTime"]
                st_val << datapoints[k]["Val"]
                count += 1 
            elsif datapoints[k]["Val"] != nil
                if datapoints_tune.size==0
                    avg = moving_sum/window_value;
                    final = st_time[st_time.size-1]
                    datapoints_tune.push({"StartTime"=>final, "Val"=>avg, "Total"=>moving_sum})
                end
                moving_sum -= st_val.shift;
                st_val << datapoints[k]["Val"]
                moving_sum += datapoints[k]["Val"];
                avg = moving_sum/window_value;
                datapoints_tune.push({"StartTime"=>datapoints[k]["StartTime"], "Val"=>avg,"Total"=>moving_sum})      
            else
                datapoints_tune.push({"StartTime"=>datapoints[k]["StartTime"], "Val"=>nil,"Total"=>moving_sum})
            end
        end
        # Corner case, if window points is equal or larger than the size of total datapoints
        if datapoints_tune.size==0
            avg = moving_sum/window_value;
            final = st_time[st_time.size-1]
            datapoints_tune.push({"StartTime"=>final, "Val"=>avg,"Total"=>moving_sum})
        end
        return datapoints_tune
    end   

    def get_medium_time(start, final, window_value)
        difference = (Time.parse(final).to_i - Time.parse(start).to_i)/window_value;
        medium_sec = Time.parse(start).to_i + difference;
        return Time.at(medium_sec);        
    end

    def get_avg(datapoints)
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

    def get_volume(datapoints)
        sum = 0;
        for i in 0..datapoints.size-1
          if datapoints[i]["Total"] != nil
            sum += datapoints[i]["Total"];
          end
        end
        sum = sum != 0 ? sum : ""; 
        return sum;
    end

    def get_datapoint(metricName_list,period,startTime,endTime)
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

    # Retrieve Alarm_Setting from Aurora DB.
    #
    # Table schema for Alarm_Setting:
    # [
    # PRIMARY KEY(id)),
    # alarm_setting TEXT,
    # mail_list TEXT;
    # ]  
    # Default Value:
    # alarm_setting = "{
    #                     shoes_alarm_par => {
    #                       machine_studio => {
    #                           tilt => [SDF4A,FRA3B,DEL3A,CWL1B,SHA2B,SHA2A,IND4A,SDF6A,CVG1D,NRT5B,NRT5A,CWL1_DE,ORY1C,FRA3A,LYS1A],
    #                           milo => [FRA3B,AVP3A,MAD4B,MEX1A,LYS1A,KIX1B,MXP5B,CWL1B,LEJ2B],
    #                           hex => [SDF4A]
    #                       },
    #                       threshold => {tilt => 91, milo => 67, hex => 37},
    #                       condition => 2,
    #                       condition_below_avg => 5,
    #                       product => shoes
    #               },
    #               books_alarm_par => {
    #                       machine_studio => {
    #                           sis => [XBRZA,PHX6B,SHA2A,BOM1B,KIX1B,NRT1B,MRS1A,MXP5B,MEX1A,EDI4A,MAD4B,SHA2B,OAK4A,PEK3B,CHA1B]
    #                       },
    #                       threshold => {sis => 91.5},
    #                       condition => 2,
    #                       condition_below_avg => 5,
    #                       product => books
    #               },
    #               apparel_alarm_par => {
    #                       machine_studio => {
    #                           manual => [HND15A,LHR17A,NRT5B,JFK13A]
    #                       },
    #                       threshold => {manual => 98.5},
    #                       condition => 2,
    #                       condition_below_avg => 5,
    #                       product => apparel
    #               }
    #           }"
    #
    # mail_list = "['xiaoqun@amazon.com','bpjack@amazon.com','johmccon@amazon.com']"  
    def get_store_setting
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

    # Retrieve Cross_Threshold_Alarm_Setting from Aurora DB.
    #
    # Table schema for Alarm_Setting:
    #[
    # alarm_setting TEXT,
    # studio_list TEXT,
    # recovery TEXT,
    # attemptsThreshold TEXT
    # ]
    # Default Value:
    # alarm_setting = Same as above.
    # studio_list = {}
    # recovery = "7"
    # attemptsThreshold = "50"
    #
    def get_store_cross_threshold_setting
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

    # Retrieve Permission_List from Aurora DB.
    #
    # Table schema for Permission_List:
    #[
    # id INT,
    # user TEXT
    # ]
    def get_permission_list
        db = open_rds_db();
        result = db.query("SELECT * FROM autoretouch.Permission_List");
        result.each do |row|
            puts row
        end
        db.close();
    end

    def add_permission_user(user)
        db = open_rds_db();
        db.query("INSERT INTO autoretouch.Permission_List(user) VALUES('"+user+"')");
        db.close();
    end

    def save_setting(data,type)
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
end

