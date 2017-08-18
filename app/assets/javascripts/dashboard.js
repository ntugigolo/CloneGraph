    var elementIsClicked = false; 
    var formList = [];
    var timeList = JSON.parse(localStorage.getItem("timeList"));
    var machineList = JSON.parse(localStorage.getItem("machineList"));
    var product = JSON.parse(localStorage.getItem("product"));
    var graphDOMElems = [];
    var colorList = ['#d5d552','#00b0f0','#00b050','purple','red']
    var studioList = {}
    // Default
    var parList = {
      "windowValue": 1,
      "weightValue": 0.5
    }
    var context_;
    var marginPercentLeft = (JSON.parse(localStorage.getItem("type"))=="studios") ? 0.56 : 0.22;

    function clickHandler(){ 
      elementIsClicked = true;
    }
    
    function makeGraph(domElement, reportData, color) {

        var yData = [];
        var yDatas = [];
        var xLabels = [];

        for (var j = 0; j < reportData.length; j++) {    
          xLabels = []
          for(var k=0; k<reportData[j].length; k++){
            yData.push({x: k, y: parseFloat(reportData[j][k].Val)});
            var label = reportData[j][k].StartTime;
            if(label == null) continue;
            var arr = label.split('-');
                var months = ['1/', '2/', '3/', '4/', '5/', '6/', '7/', '8/', '9/', '10/', '11/', '12/'];
                label = arr[0]+"/"+ months[parseInt(arr[1]) - 1]+arr[2].split(':')[0].split('T')[0]+"-"+arr[2].split(':')[0].split('T')[1] +":" + arr[2].split(':')[1];
            
            xLabels.push(label);
          }
          yDatas.push(yData)
          yData = []
        }
        
        var graph = new GRAPH.Graph(domElement, { 
            marginX: 4,
            marginY: 4,
            digits: 0, 
            gridDrawVertical: false,
            gridDrawHorizontalNegative: true,
            highlightXAxis: true, 
            allowZoom: false,
            font : '600 11.5px Open Sans',
            gridSize: 24, 
            hideNegativeYCoordinates: true,
            hideNegativeYGrid: true,
            marginPercentBottom: 0.65, 
            marginPercentLeft: marginPercentLeft,
            marginPercentRight: 0.1});

        for(var i=0;i<yDatas.length;i++){    
          graph.addDataSet({
              data: yDatas[i],
              color: color[i],
              fill : false,
              type: 'line',
              barWidth: 12,
              xLabelsSkipDistance: 18,
              xLabels: xLabels,
              xLabelsRotation: (-35 / 180) * Math.PI,
          });
        }

        graph.autoAdjustLimits();
        
        getComputedStyle(domElement).opacity;
        domElement.style.opacity = 1;
    }
    // Generate 'Start' and 'End' date as time range parameters, also calculate time duration in sec unit. 
    // Ex. Now is 2017-07-03T18:00Z.
    //     Input: startNumdays,startNumHours,endNumDays,endNumHours = 7,0,2,0
    //     Output: [ startTime: 2017-06-26T18:00Z endTime: 2017-07-01T18:00Z,
    //               startDuration: 7*60*60*24, endDuration: 2*60*60*24]
    function getStartEndDate(startNumDays,startNumHours,endNumDays,endNumHours){

        hour = 60 * 60;
        day = hour * 24;

        startDuration = startNumDays * day + startNumHours * hour;
        endDuration = endNumDays * day + endNumHours * hour;

        var date = new Date();

        startTimeMilisec = new Date(date.getTime() - startDuration*1000);
        endTimeMilisec = new Date(date.getTime() - endDuration*1000);

        var startMonth = ('0' + (startTimeMilisec.getUTCMonth() + 1)).substr(-2);
        var startDate = ('0' + startTimeMilisec.getUTCDate()).substr(-2);
        var startHour = ('0' + startTimeMilisec.getUTCHours()).substr(-2);
        var startMin = ('0' + startTimeMilisec.getUTCMinutes()).substr(-2);

        var endMonth = ('0' + (endTimeMilisec.getUTCMonth() + 1)).substr(-2);
        var endDate = ('0' + endTimeMilisec.getUTCDate()).substr(-2);
        var endHour = ('0' + endTimeMilisec.getUTCHours()).substr(-2);
        var endMin = ('0' + endTimeMilisec.getUTCMinutes()).substr(-2);        

        startTime = startTimeMilisec.getUTCFullYear() + "-"
                    +startMonth + '-'
                    +startDate + "T"
                    +startHour + ":"
                    +startMin+":00Z";

        endTime = endTimeMilisec.getUTCFullYear()+"-"
                    +endMonth + '-'
                    +endDate + "T"
                    +endHour + ":"
                    +endMin+":00Z";

        return [startTime,endTime,startDuration,endDuration];
    }
    // Make an ajax call to ApplicationController's function to retrieve PMET metrics data.
    function loadMetricsData(machineName, parList, timeList, studioName){

        period = timeList["period"];
        startNumDays = timeList["startNumDays"];
        startNumHours = timeList["startNumHours"];
        endNumDays = timeList["endNumDays"];
        endNumHours = timeList["endNumHours"];

        var tmp = getStartEndDate(startNumDays,startNumHours,endNumDays,endNumHours);
        var startTime = tmp[0];
        var endTime = tmp[1];
        var startDuration = tmp[2];
        var endDuration = tmp[3];
      
        function getMetricsData(){
            $.ajax({
              type:'GET',
              async: false,
              url:"get_metrics_data",
              dataType:'json',
              data:{
                'product':product,
                'machineName': machineName,
                'period': period,
                'startTime':startTime,
                'endTime':endTime,
                'startDuration': startDuration,
                'endDuration': endDuration,
                'parList': parList,
                'studioName': studioName
              },
              success:function(result){
                metricsData = result;
              }
            }); 
        };
        getMetricsData();
        return metricsData;
    }

    // Make an ajax call to ApplicationController's function to retrieve studio list by given machine/product.
    function loadStudioList(machineName,product){
      
        function retrieveStudioList(){
            $.ajax({
              type:'GET',
              async: false,
              url:"get_studio_list",
              data:{
                'product':product,
                'machineName': machineName
              },
              success:function(result){
                resStudioList = result;
              }
            }); 
        };
        retrieveStudioList();
        return resStudioList;
    }

    function callDailyReport(){
        function callDaily(){
            $.ajax({
              type:'GET',
              async: false,
              url:"daily_alarm_report"
            }); 
        };
        callDaily();
    }

    function onPageLoad(context) {
        var call = window.setInterval(callDailyReport,50000);
        clearInterval(call);

        context.appearBusy(false);
        document.getElementById('timePeriod').style.display = 'block';

        graphDOMElems = [];
        getStudioList();

        formList = [];
        idx = 0;
        for(var i = 0; i < machineList.length; i++)
        {
          for(var j=0; j<studioList[machineList[i]].length; j++){
            var studioName = studioList[machineList[i]][j];
            var listSR = document.getElementById('graphListSR');

            var templateSR = document.getElementById('graphTemplateSR');           
            var cloneSR = COMMON.cloneElement(templateSR);
            graphDOMElems.push(cloneSR.getElementById('graph'));
            var titleSR = cloneSR.getElementById('title');
            listSR.appendChild(cloneSR);

            formList.push(cloneSR.getElementById('form-inline'));
            if(machineList[i]!='tilt') document.getElementById(formList[idx].id).elements["input_weight"].type = 'hidden'

            adjustGraphStyle(cloneSR.getElementById('graph').id,cloneSR.getElementById('graphContainer').id,formList[idx].id);

            document.getElementsByName("input_start")[0].placeholder= timeList["startNumDays"];
            document.getElementsByName("input_end")[0].placeholder= 0;
             
            cloneSR.style.display = 'block';

            getComputedStyle(cloneSR).opacity;
            cloneSR.style.opacity = 1;
            // If it's default studioList(for machine diagram page), then studioName is null.
            studioNameAjax = (studioName == machineList[i]) ? "N/A" : studioName;
            metricsData = loadMetricsData(machineList[i],parList,timeList,studioNameAjax);
            datapoints = jQuery.parseJSON(metricsData["datapoints"]);

            thresholdValue = metricsData["threshold"];
            thresholdLine = getThresholdLine(thresholdValue,datapoints.length);
            avgDatapoints = getAvg(datapoints);

            condition = metricsData["condition"];
            signalHtml = getAlarmSignal(avgDatapoints,thresholdValue,condition);

            titleName = (studioName == machineList[i]) ? studioName : (product != "apparel") ? machineList[i]+"-"+studioName : studioName;
            var innerHtml = drawPercentBar(100,avgDatapoints,colorList[i],"none",titleName) + "&nbsp"
                            +drawPercentBar(100,thresholdValue,colorList[4],"none","Threshold")
                            +signalHtml;
            titleSR.innerHTML = innerHtml;

            dataWrap = []
            dataWrap.push(thresholdLine)
            dataWrap.push(datapoints)
            makeGraph(graphDOMElems[idx], dataWrap, [colorList[4],colorList[i]]);
            idx += 1;
          }
        }

        context.appearReady();
        context_ = context
    }
    
    function unloadGraph() {
          document.getElementById('graphListSR').innerHTML = "";
    }

    function tuneDataPoints(form,refresh){
      var dataWrap = []
      var windowValue = document.getElementById(form.id).elements["input_window"].value;
      var weightValue = document.getElementById(form.id).elements["input_weight"].value;
      if(typeof refresh != "undefined")  document.getElementById(refresh.id).addEventListener("click", clickHandler());

      windowValue = (windowValue==0 || elementIsClicked)?1:windowValue;
      weightValue = (weightValue==0 || elementIsClicked)?0.5:weightValue;
      elementIsClicked = false;
      parList = {
        "windowValue": windowValue,
        "weightValue": weightValue
      }
      idx = findGraphId(form);

      metricsData = loadMetricsData(machineList[idx],parList,timeList, null);
      datapoints = jQuery.parseJSON(metricsData["datapoints"]);
      thresholdValue = metricsData["threshold"];
      thresholdLine = getThresholdLine(thresholdValue,datapoints.length);
      dataWrap.push(thresholdLine)
      dataWrap.push(datapoints)

      makeGraph(graphDOMElems[idx], dataWrap, [colorList[4],colorList[idx]]);
    }

    function findGraphId(form){
      idx = 0;
      for(var i=0;i<formList.length;i++){
        if(form.id == formList[i].id) {
          idx = i;
          break;
        }
      }
      return idx;
    }

    function changeTimePoints(form){
      var dayHour = document.getElementById("StartSelect").value;
      var value = document.getElementById(form.id).elements["input_start"].value;
      var startDays = (dayHour == 1)?value:0;
      var startHours = (dayHour == 2)?value:0;
      dayHour = document.getElementById("EndSelect").value;
      value = document.getElementById(form.id).elements["input_end"].value;

      var endDays = (dayHour == 1)?value:0;
      var endHours = (dayHour == 2)?value:0;
      var period = document.getElementById("PeriodSelect").value;
      timeList = {"period":period,
                   "startNumDays":startDays,
                   "startNumHours":startHours,
                   "endNumDays":endDays,
                   "endNumHours":endHours   
      };
      localStorage.setItem("timeList",JSON.stringify(timeList));
      unloadGraph();
      onPageLoad(context_);
    }

    function reduceCycle(){
      var startDays = isNaN(parseInt(timeList["startNumDays"]))?0:parseInt(timeList["startNumDays"]);
      var startHours = isNaN(parseInt(timeList["startNumHours"]))?0:parseInt(timeList["startNumHours"]);
      var endDays = isNaN(parseInt(timeList["endNumDays"]))?0:parseInt(timeList["endNumDays"]);
      var endHours = isNaN(parseInt(timeList["endNumHours"]))?0:parseInt(timeList["endNumHours"]);
      var newStartDays;
      var newStartHours;

      timeList["endNumDays"] = startDays;
      timeList["endNumHours"] = startHours;

      if(endHours<=startHours){
        newStartDays = startDays + startDays - endDays;
        newStartHours = timeList["endNumHours"] + startHours - endHours;
      }else{
        while(endHours>startHours){
          startHours += 24;
          newStartDays = startDays + startDays - endDays - 1;
          newStartHours = timeList["endNumHours"] + startHours - endHours;
          endDays -= 1;
        }
      }
      timeList["startNumDays"] = newStartDays ;
      timeList["startNumHours"] = newStartHours;
    }
    function increaseCycle(){
      var startDays = isNaN(parseInt(timeList["startNumDays"]))?0:parseInt(timeList["startNumDays"]);
      var startHours = isNaN(parseInt(timeList["startNumHours"]))?0:parseInt(timeList["startNumHours"]);
      var endDays = isNaN(parseInt(timeList["endNumDays"]))?0:parseInt(timeList["endNumDays"]);
      var endHours = isNaN(parseInt(timeList["endNumHours"]))?0:parseInt(timeList["endNumHours"]);
      var newEndDays;
      var newEndHours;

      timeList["startNumDays"] = endDays;
      timeList["startNumHours"] = endHours;

      if(endHours>=startHours){
        newEndDays = endDays - startDays + endDays;
        newEndHours = timeList["startNumHours"] + endHours - startHours;
      }else{
        while(endHours<startHours){
          endHours += 24;
          newEndDays = endDays - startDays + endDays-1;
          newEndHours = timeList["startNumHours"] + endHours - startHours;
          startDays += 1;
        }
      }
      timeList["endNumDays"] = newEndDays ;
      timeList["endNumHours"] = newEndHours;
    }
    // Modify from here: 
    // http://www.alpinemeadow.com/stitchery/weblog/HTML-morsels.html
    function drawPercentBar(width, percent, color, background, machineName)
    {
        var barhtml = "";
        var pixels = width * (percent / 100);
        machineName = machineName == "manual" ? "success" : machineName;
        if (!background) { background = "none"; }

        barhtml += "<div style=\"position: relative  line-height: 1em; background-color: "
            + background + "; border: 1px solid black; width: "
            + width + "px\" class = div-inline>";
        barhtml += "<div style=\"height: 1.5em; width: " + pixels + "px; background-color: "
            + color + ";\" display: inline>"+ percent +"%"+"</div>";

        barhtml += "<font color="+color+">"+machineName.toUpperCase()+"</font>"+"</div>";

        return barhtml+"&nbsp"+"&nbsp"+"&nbsp";
    }

    function getAvg(datapoints){
        var sum = 0;
        var len = 0;
        for (var i = 0; i < datapoints.length; i++) {
          if(datapoints[i].Val != null){
            sum += datapoints[i].Val;
            len += 1;
          }
        }
        var avg = (len>0) ? (sum/len).toFixed(2).toString() : null;
        return avg;
    }
    function getThresholdLine(threshold,length){
        var thresholdLine = [];
        for(var i=0;i<length;i++){
          thresholdLine.push({StartTime:null, Val:threshold})
        }
        return thresholdLine;
    }

    function getAlarmSignal(avgDatapoints,threshold,condition){
      var signalHtml = "";
      if(avgDatapoints == null)
        signalHtml = ""
      else if (parseFloat(threshold)-parseFloat(condition) > parseFloat(avgDatapoints))
        signalHtml= "<img src='assets/redsignal.png' style='width:60px; height:36px; padding-left: 1.5em'>"
      else
        signalHtml = "<img src='assets/greensignal.png' style='width:60px; height:36px; padding-left: 1.5em'>"
      return signalHtml;
    }

    function getDefaultStudioList(){
      for(var i = 0; i < machineList.length; i++){
        studioList[machineList[i]] = [machineList[i]];
      }
    }

    function getStudioList(){
      getDefaultStudioList()
      // Generate stdiouswide list
      if(JSON.parse(localStorage.getItem("type")) == "studios"){
        for (var key in studioList) {
          studioList[key] = JSON.parse(loadStudioList(key,product));
        }
      }
    }

    function adjustGraphStyle(graphId,graphConId,formListId){
      if(JSON.parse(localStorage.getItem("type")) == "studios"){
        document.getElementById(graphConId).style.width = "300px";
        document.getElementById(graphConId).style.height = "210px";
        document.getElementById(graphId).style.width = "300px";
        document.getElementById(graphId).style.height = "210px";
        document.getElementById(formListId).style.display="none";
      }
    }