var GRAPH = {};

//
// Graph class
//
GRAPH.Graph = function (domContainer, config) {
    // Default values
    this.config = {
        gridColor : '#393939',
        gridThickness : 1,
        gridDrawHorizontal: true,
        gridDrawVertical: true,
        gridDrawHorizontalNegative: true,
        fontColor : '#c0c0c0',
        font : '600 12px Open Sans',
        marginX : 4,
        marginY : 4,
        backgroundColor : ['#161616', '#303030'],
        gridSize : 64,
        digits : 2,
        highlightXAxis : false,
        highlightYAxis : false,
        highlightAxisColor : '#494949',
        allowZoom: true,
        marginPercentTop: 0.15,
        marginPercentBottom: 0.15,
        marginPercentLeft: 0,
        marginPercentRight: 0,
        hideNegativeYCoordinates: false,
    }
    // Override default value(s)
    for (var key in config) {
        this.config[key] = config[key];
    }
    // Initialize
    this.domContainer = domContainer;
    this.dataSets = [];
    this.animator = new ANIMATOR.Animator();
    this.initialize();
}
GRAPH.Graph.prototype = {
    constructor : GRAPH.Graph,
    addDataSet : function (dataSet) {
        // Default values
        var set = {
            color : '#ff0000',
            fill : true,
            lineThickness : 2.0,
            showMarkers : true,
            type : 'line',
            barWidth : 8,
            xLabels: undefined,
            drawVerticalLines: false,
            xLabelsRotation: undefined,
            xLabelsSkipDistance: 64,
            highlightDataPointsOnHover: true,
            highlightDataPointsRadius: 12,
            highlightDataPointsColor: '#0096ff',
            highlightDataPointsClickHandler: undefined,
        }
        // Override default value(s)
        for (var key in dataSet) {
            set[key] = dataSet[key];
        }
        // Append data set
        this.dataSets.push(set);
        this.invalidate();
    },
    initialize : function () {
        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.style.cursor = 'crosshair';
        this.canvas.style['user-select'] =
            this.canvas.style['-webkit-touch-callout'] =
            this.canvas.style['-webkit-user-select'] =
            this.canvas.style['-khtml-user-select'] =
            this.canvas.style['-moz-user-select'] =
            this.canvas.style['-ms-user-select'] = 'none';
        this.canvas.style.display = 'block';
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0px';
        this.canvas.style.left = '0px';
        this.ctx = this.canvas.getContext('2d');
        this.domContainer.style.position = 'relative';
        this.domContainer.appendChild(this.canvas);

        // Hook up events
        var context = this;
        window.addEventListener('resize', function () {
            context.resize();
        });
        this.canvas.addEventListener('mousedown', function (e) {
            context.mouseDown(e);
        });
        window.addEventListener('mousemove', function (e) {
            context.mouseMove(e);
        });
        window.addEventListener('mouseup', function (e) {
            context.mouseUp(e);
        });
        window.addEventListener('contextmenu', function (e) {
            return context.contextMenu(e);
        });

        // Do initial render
        this.rendering = false;
        this.resize();
        this.invalidate();
    },
    mouseDown : function (e) {
        if (this.hitDataPoint && this.hitDataPoint.clickHandler) {
            this.hitDataPoint.clickHandler(this.hitDataPoint);
        } else {
            if (this.config.allowZoom) {
                var horizontal = (e.button == 0);
                this.selecting = horizontal ? 'x' : 'y';
                this.selectA = horizontal ? e.offsetX : e.offsetY;
                this.selectB = horizontal ? e.offsetX : e.offsetY;
            }
        }
    },
    mouseMove : function (e) {
        var rect = this.canvas.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;

        switch (this.selecting) {
            case 'x':
                this.selectB = Math.max(0, Math.min(x, this.canvas.virtualWidth));
                this.invalidate();
                break;
            case 'y':
                this.selectB = Math.max(0, Math.min(y, this.canvas.virtualHeight));
                this.invalidate();
                break;
            default:
                this.checkHitTargets(x, y);
                break;
        }
    },
    mouseUp : function (e) {
        if (this.selecting) {
            var horizontal = (this.selecting == 'x');
            this.selecting = undefined;

            var pixelA = Math.min(this.selectA, this.selectB);
            var pixelB = Math.max(this.selectA, this.selectB);
            var graphA,
            graphB,
            object;

            if (horizontal) {
                graphA = this.pixelToGraph(pixelA, 0).x;
                graphB = this.pixelToGraph(pixelB, 0).x;
                object = this.config.xlim;
            } else {
                graphB = this.pixelToGraph(0, this.canvas.virtualHeight - pixelA).y;
                graphA = this.pixelToGraph(0, this.canvas.virtualHeight - pixelB).y;
                object = this.config.ylim;
            }

            if (Math.abs(graphA - graphB) > 1e-8) {
                this.animator.animate({
                    object : object,
                    property : 0,
                    to : graphA,
                    duration : 500,
                });
                this.animator.animate({
                    object : object,
                    property : 1,
                    to : graphB,
                    duration : 500,
                });

                var context = this;
                this.suppressContextMenu = true;
                setTimeout(function () {
                    context.suppressContextMenu = false;
                }, 200);
            }

            this.invalidate();
        }
    },
    contextMenu : function (e) {
        if (this.suppressContextMenu) {
            e.preventDefault();
            return false;
        } else {
            return true;
        }
    },
    checkHitTargets: function(x, y) {
        var targetToRender;
        for (var i = 0; i < this.dataSets.length; i++) {
            var dataSet = this.dataSets[i];
            if (dataSet.highlightDataPointsOnHover && dataSet.type == 'line') {
                for (var j = 0; j < dataSet.data.length; j++) {
                    var pixelPoint = dataSet.pixelPoints[j];
                    if (Math.abs(pixelPoint.x - x) < dataSet.highlightDataPointsRadius && 
                        Math.abs(pixelPoint.y - y) < dataSet.highlightDataPointsRadius) {
                        targetToRender = {
                            x: pixelPoint.x,
                            y: pixelPoint.y,
                            xInfo: dataSet.xLabels ? dataSet.xLabels[j] : dataSet.data[j].x,
                            yInfo: dataSet.data[j].y,
                            clickHandler: dataSet.highlightDataPointsClickHandler,
                        };
                        break;
                    }
                }
            }
            if (targetToRender) {
                break;
            }
        }
        
        var context = this;
        var fade = function(dataPoint, to) {
            if (dataPoint) {
                dataPoint.opacity = dataPoint.opacity ? dataPoint.opacity : 0;
                context.animator.animate({
                    object: dataPoint,
                    property: 'opacity',
                    to: to,
                    duration: 300,
                    ease: 3,
                });
            }
        }
        if (!targetToRender && this.hitDataPoint) {
            this.canvas.style.cursor = 'crosshair';
            this.hitDataPoint = undefined;
            this.invalidate();
        } 
        if (targetToRender) {
            var changed = this.hitDataPoint ? (this.hitDataPoint.x !== targetToRender.x || this.hitDataPoint.y !== targetToRender.y) : true;
            if (changed) {
                this.hitDataPoint = targetToRender;
                fade(this.hitDataPoint, 1);
                this.canvas.style.cursor = 'pointer';
                this.invalidate();
            }
        }
    },
    clearDataSets : function () {
        this.dataSets.clear();
        this.invalidate();
    },
    computeBoundaries: function() {
        var xMin = Number.MAX_VALUE;
        var xMax = -Number.MAX_VALUE;
        var yMin = Number.MAX_VALUE;
        var yMax = -Number.MAX_VALUE;
        for (var i = 0; i < this.dataSets.length; i++) {
            var data = this.dataSets[i].data;
            for (var j = 0; j < data.length; j++) {
                var pt = data[j];
                xMin = Math.min(xMin, pt.x);
                xMax = Math.max(xMax, pt.x);
                if(!isNaN(pt.y)) yMin = Math.min(yMin, pt.y);
                yMax = Math.max(100, 100);
            }
            if (this.dataSets[i].type == 'bar') {
                yMin = Math.min(0, yMin);
                yMax = Math.max(0, yMax);
            }
        }
        if (yMax <= yMin) {
            yMin = 0;
            yMax = 100;
        }
        if (xMax <= xMin) {
            xMin = 0; 
            xMax = 100;
        }
        return {xMin: xMin, xMax: xMax, yMin: yMin, yMax: yMax};
    },
    zoomIn: function(animate) {
        var width = this.config.xlim[1] - this.config.xlim[0];
        var height = this.config.ylim[1] - this.config.ylim[0];
        var dx = width * 0.25;
        var dy = height * 0.25;
        this.setZoom(
            animate, 
            this.config.xlim[0] + dx, this.config.xlim[1] - dx, 
            this.config.ylim[0] + dy, this.config.ylim[1] - dy);
    },
    zoomOut: function(animate) {
        var rect = this.computeBoundaries();
        var width = this.config.xlim[1] - this.config.xlim[0];
        var height = this.config.ylim[1] - this.config.ylim[0];
        var dx = width * 0.25;
        var dy = height * 0.25;
        this.setZoom(
            animate, 
            Math.max(rect.xMin, this.config.xlim[0] - dx), Math.min(rect.xMax, this.config.xlim[1] + dx), 
            this.config.ylim[0] - dy, this.config.ylim[1] + dy);
    },
    autoAdjustLimits : function(animate) {
        var rect = this.computeBoundaries();
        var xMin = rect.xMin;
        var xMax = rect.xMax;
        var yMin = rect.yMin;
        var yMax = rect.yMax;
        
        var marginTop = (yMax - yMin) * this.config.marginPercentTop;
        var marginBottom = (yMax - yMin) * this.config.marginPercentBottom;
        var marginLeft = (xMax - xMin) * this.config.marginPercentLeft;
        var marginRight= (xMax - xMin) * this.config.marginPercentRight;
        
        this.setZoom(animate, xMin - marginLeft, xMax + marginRight, yMin - marginBottom, yMax + marginTop);
    },
    setZoom: function(animate, xMin, xMax, yMin, yMax) {
        if (animate) {
            var duration = 500;
            this.animator.animate({
                object : this.config.xlim,
                property : 0,
                to : xMin,
                duration : duration,
            });
            this.animator.animate({
                object : this.config.xlim,
                property : 1,
                to : xMax,
                duration : duration,
            });
            this.animator.animate({
                object : this.config.ylim,
                property : 0,
                to : yMin,
                duration : duration,
            });
            this.animator.animate({
                object : this.config.ylim,
                property : 1,
                to : yMax,
                duration : duration,
            });
        } else {
            this.config.xlim = [xMin, xMax];
            this.config.ylim = [yMin, yMax];
        }
        this.invalidate();
    },
    resize : function () {
        var style = window.getComputedStyle(this.domContainer, null);
        var width = style.getPropertyValue('width');
        var height = style.getPropertyValue('height');
        width = width.substring(0, width.length - 2);
        height = height.substring(0, height.length - 2);
        var w = parseInt(width);
        var h = parseInt(height);
        
        var devicePixelRatio = window.devicePixelRatio || 1;
        var backingStoreRatio = this.ctx.webkitBackingStorePixelRatio ||
                                this.ctx.mozBackingStorePixelRatio ||
                                this.ctx.msBackingStorePixelRatio ||
                                this.ctx.oBackingStorePixelRatio ||
                                this.ctx.backingStorePixelRatio || 1;

        var ratio = devicePixelRatio / backingStoreRatio;
        
        var scaledWidth = w * ratio;
        var scaledHeight = h * ratio;
        
        this.canvas.virtualWidth = w;
        this.canvas.virtualHeight = h;
        
        if (this.canvas.width != scaledWidth || this.canvas.height != scaledHeight) {
            this.canvas.width = scaledWidth;
            this.canvas.height = scaledHeight;
            this.canvas.style.width = w + 'px';
            this.canvas.style.height = h + 'px';
            this.ctx = this.canvas.getContext('2d');
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.scale(ratio, ratio);
            this.invalidate();
        }
    },
    invalidate : function () {
        if (!this.rendering) {
            this.rendering = true;
            this.scheduleNextRender();
        }
    },
    scheduleNextRender : function () {
        var context = this;
        requestAnimationFrame(function () {
            context.render();
        });
    },
    pixelToGraph : function (xPixel, yPixel) {
        var wPixel = this.canvas.virtualWidth;
        var hPixel = this.canvas.virtualHeight;
        var wGraph = this.config.xlim[1] - this.config.xlim[0];
        var hGraph = this.config.ylim[1] - this.config.ylim[0];
        var xGraph = this.config.xlim[0] + (xPixel / wPixel) * wGraph;
        var yGraph = this.config.ylim[0] + (yPixel / hPixel) * hGraph;
        return {
            x : xGraph,
            y : yGraph
        };
    },
    graphToPixel : function (xGraph, yGraph) {
        var wPixel = this.canvas.virtualWidth;
        var hPixel = this.canvas.virtualHeight;
        var wGraph = this.config.xlim[1] - this.config.xlim[0];
        var hGraph = this.config.ylim[1] - this.config.ylim[0];
        var xPixel = ((xGraph - this.config.xlim[0]) / wGraph) * wPixel;
        var yPixel = ((yGraph - this.config.ylim[0]) / hGraph) * hPixel;
        return {
            x : xPixel,
            y : yPixel
        };
    },
    pixelDistToGraphDist : function (xPixelDist, yPixelDist) {
        var wPixel = this.canvas.virtualWidth;
        var hPixel = this.canvas.virtualHeight;
        var wGraph = this.config.xlim[1] - this.config.xlim[0];
        var hGraph = this.config.ylim[1] - this.config.ylim[0];
        var xGraphDist = (xPixelDist / wPixel) * wGraph;
        var yGraphDist = (yPixelDist / hPixel) * hGraph;
        return {
            x : xGraphDist,
            y : yGraphDist
        };
    },
    renderText : function (x, xalign, y, yalign, allowClip, text) {
        var ctx = this.ctx;
        var width = ctx.measureText(text).width;
        var height = ctx.measureText('O').width;
        var x0 = x;
        switch (xalign) {
        case 'C':
            x0 -= width * 0.5;
            break;
        case 'L':
            x0 -= width;
            break;
        }
        var y0 = y;
        switch (yalign) {
        case 'C':
            y0 += height * 0.5;
            break;
        case 'B':
            y0 += height;
            break;
        }

        var inside =
            x0 > 0 &&
            y0 - height > 0 &&
            x0 + width < this.canvas.virtualWidth &&
            y0 < this.canvas.virtualHeight;

        if (inside || allowClip) {
            ctx.fillText(text, x0, y0);
        }
    },
    round : function (val, digits) {
        if (Math.abs(val - Math.round(val)) < 1e-14) {
            return Math.round(val);
        } else {
            return val.toFixed(digits);
        }
    },
    computePixelPoints : function (dataSet) {
        var pixelPoints = [];
        for (var j = 0; j < dataSet.data.length; j++) {
            var pixelPos = this.graphToPixel(dataSet.data[j].x, dataSet.data[j].y);
            var x = pixelPos.x;
            var y = this.canvas.virtualHeight - pixelPos.y;
            if(isNaN(dataSet.data[j].y)) {y = null;}

            pixelPoints.push({
                x : x,
                y : y
            });
        }
        return pixelPoints;
    },
    renderBarGraph : function (ctx, dataSet) {
        // Prepare variables
        var pixelZeroY = this.canvas.virtualHeight - this.graphToPixel(0, 0).y;
        var pixelPoints = dataSet.pixelPoints;

        // Draw bars
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.shadowBlur = 20;
        ctx.fillStyle = dataSet.color;
        for (var i = 0; i < pixelPoints.length; i++) {
            var pt = pixelPoints[i];
            ctx.fillRect(pt.x - dataSet.barWidth * 0.5, Math.min(pt.y, pixelZeroY), dataSet.barWidth, Math.abs(pt.y - pixelZeroY));
        }
        ctx.restore();
    },
    renderLineGraph : function (ctx, dataSet,idx) {
        // Prepare variables
        var wPixel = this.canvas.virtualWidth;
        var hPixel = this.canvas.virtualHeight;

        // Find minimum Y value
        var pixelPoints = dataSet.pixelPoints;
        var pixelMinY = (pixelPoints && pixelPoints.length > 0) ? pixelPoints[0].y : 0;
        for (var j = 0; j < pixelPoints.length; j++) {
            pixelMinY = Math.min(pixelMinY, pixelPoints[j].y);
        }

        // Set line style
        ctx.lineJoin = 'round';
        ctx.strokeStyle = dataSet.color;
        ctx.lineWidth = dataSet.lineThickness;
        // Draw line
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.shadowBlur = 20;
        ctx.beginPath();
        for (var j = 0; j < pixelPoints.length; j++) {
            var x = pixelPoints[j].x;
            var y = pixelPoints[j].y;
            if(y==null){continue;}
            if (j == 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
        ctx.restore();

        // Draw fill
        if (dataSet.fill && pixelPoints.length > 0) {

            // Fill
            ctx.beginPath();
            var gradient = ctx.createLinearGradient(0, pixelMinY, 0, hPixel);
            gradient.addColorStop(0, dataSet.color);
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
            ctx.fillStyle = gradient;
            var first = pixelPoints[0];
            var last = pixelPoints[pixelPoints.length - 1];
            ctx.moveTo(first.x, first.y);
            for (var j = 1; j < pixelPoints.length; j++) {
                ctx.lineTo(pixelPoints[j].x, pixelPoints[j].y);
            }
            ctx.lineTo(last.x, hPixel);
            ctx.lineTo(first.x, hPixel);
            ctx.fill();

            // Re-draw line (without drop shadow) to hide overlap
            ctx.beginPath();
            for (var j = 0; j < pixelPoints.length; j++) {
                var x = pixelPoints[j].x;
                var y = pixelPoints[j].y;
                if (j == 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }

        // Draw markers
        if (dataSet.showMarkers) {
            ctx.fillStyle = dataSet.color;
            for (var j = 0; j < pixelPoints.length; j++) {
                var x = pixelPoints[j].x;
                var y = pixelPoints[j].y;
                // Skip the nil y-value
                if(y==null){continue;}
                ctx.beginPath();
                ctx.arc(x, y, dataSet.lineThickness * 1.5, 0.0, 2.0 * Math.PI, false);
                ctx.fill();
            }
        }
        
        // Helper function for drawing selected/highlighted data points
        var context = this;
        var drawSelectedDataPoint = function(dataPoint) {
            if (dataPoint && dataPoint.opacity > 0) {
                ctx.save();
                ctx.globalAlpha = dataPoint.opacity * 0.6;
                ctx.fillStyle = dataSet.highlightDataPointsColor;
                ctx.strokeStyle = dataSet.highlightDataPointsColor;
                ctx.beginPath();
                ctx.arc(dataPoint.x, dataPoint.y, dataSet.highlightDataPointsRadius, 0.0, 2.0 * Math.PI, false);
                ctx.fill();
                ctx.lineWidth = 1;
                ctx.globalAlpha = dataPoint.opacity
                
                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 1.0)';
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                ctx.shadowBlur = 8;
                ctx.stroke();
                ctx.restore();
                
                var innerMargin = 8;
                var outerMargin = 4;
                var lineHeight = ctx.measureText('O').width;
                var width = Math.max(
                    ctx.measureText(dataPoint.xInfo).width,
                    ctx.measureText(dataPoint.yInfo).width);
                
                var rectX = dataPoint.x - width * 0.5 - innerMargin;
                var rectY = dataPoint.y - dataSet.highlightDataPointsRadius - outerMargin - 2 * lineHeight - 3 * innerMargin;
                var rectW = width + 2 * innerMargin;
                var rectH = 2 * lineHeight + 3 * innerMargin;
                rectX = Math.max(0, rectX);
                rectY = Math.max(0, rectY);
                if (rectX + rectW > context.canvas.virtualWidth) {
                    rectX = context.canvas.virtualWidth - rectW;
                }
                if (rectY + rectH > context.canvas.virtualHeight) {
                    rectY = context.canvas.virtualHeight - rectH;
                }
                
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.fillRect(rectX, rectY, rectW, rectH);
                
                ctx.fillStyle = context.config.fontColor;
                ctx.fillText(dataPoint.xInfo, rectX + innerMargin, rectY + innerMargin + lineHeight);
                ctx.fillText(dataPoint.yInfo, rectX + innerMargin, rectY + (innerMargin + lineHeight) * 2);
                ctx.restore();
            }
        }
        
        // Draw currently selected data point
        drawSelectedDataPoint(this.hitDataPoint);
    },
    drawLine : function (x0, y0, x1, y1, thickness, color, lineDash) {
        var ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = thickness;
        ctx.setLineDash(lineDash);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.restore();
    },
    render : function () {
        this.rendering = this.animator.tick();
        if (this.rendering) {
            this.scheduleNextRender();
        }
        
        // Prepare variables
        var ctx = this.ctx;
        var cfg = this.config;

        var wPixel = this.canvas.virtualWidth;
        var hPixel = this.canvas.virtualHeight;

        // Set font
        if (cfg.font && cfg.font != ctx.font) {
            ctx.font = cfg.font;
        }

        // Draw background
        if (cfg.backgroundColor instanceof Array) {
            var gradient = ctx.createLinearGradient(0, 0, 0, hPixel);
            gradient.addColorStop(0, cfg.backgroundColor[0]);
            gradient.addColorStop(1, cfg.backgroundColor[1]);
            ctx.fillStyle = gradient;
        } else {
            ctx.fillStyle = cfg.backgroundColor;
        }
        ctx.fillRect(0, 0, wPixel, hPixel);

        // Draw grid
        var deltaGraph = this.pixelDistToGraphDist(cfg.gridSize, cfg.gridSize);
        ctx.fillStyle = cfg.gridColor;

        // Vertical grid lines
        var gridCoordsX = {};
        var x0 = Math.ceil(cfg.xlim[0] / deltaGraph.x) * deltaGraph.x;
        while (x0 <= cfg.xlim[1]) {
            var xPixel = this.graphToPixel(x0, 0).x;
            var isZeroAxis = (Math.abs(x0) < deltaGraph.x * 0.5);
            if (cfg.gridDrawVertical) {
                if (isZeroAxis && cfg.highlightYAxis) {
                    this.drawLine(xPixel, 0, xPixel, hPixel, cfg.gridThickness * 3, cfg.highlightAxisColor, [6, 3]);
                } else {
                    ctx.fillRect(Math.round(xPixel - cfg.gridThickness * 0.5), 0, cfg.gridThickness, hPixel);
                }
            }
            gridCoordsX[xPixel] = isZeroAxis ? 0.0 : x0;
            x0 += deltaGraph.x;
        }
        
        // Horizontal grid lines
        var gridCoordsY = {};
        var y0 = Math.ceil(cfg.ylim[0] / deltaGraph.y) * deltaGraph.y;
        while (y0 <= cfg.ylim[1]) {
            var yPixel = hPixel - this.graphToPixel(0, y0).y;
            var isZeroAxis = (Math.abs(y0) < deltaGraph.y * 0.5);
            if (cfg.gridDrawHorizontal) {
                if (isZeroAxis && cfg.highlightXAxis) {
                    this.drawLine(0, yPixel, wPixel, yPixel, cfg.gridThickness * 3, cfg.highlightAxisColor, [6, 3]);
                } else {
                    if (y0 >= 0 || (y0 < 0 && cfg.gridDrawHorizontalNegative)) {
                        ctx.fillRect(0, Math.round(yPixel - cfg.gridThickness * 0.5), wPixel, cfg.gridThickness);
                    }
                }
            }
            gridCoordsY[yPixel] = isZeroAxis ? 0.0 : y0;
            y0 += deltaGraph.y;
        }
        
        // Compute pixel points for all datasets
        for (var i = 0; i < this.dataSets.length; i++) {
            var dataSet = this.dataSets[i];
            dataSet.pixelPoints = this.computePixelPoints(dataSet);
        }
        
        // Draw vertical lines that intersects data points
        for (var i = 0; i < this.dataSets.length; i++) {
            var dataSet = this.dataSets[i];
            if (dataSet.drawVerticalLines) {
                var lastXPixel = -Number.MAX_VALUE;
                for (var j = 0; j < dataSet.pixelPoints.length; j++) {
                    // Make sure that lines are not too close together
                    var xPixel = dataSet.pixelPoints[j].x;
                    if (Math.abs(lastXPixel - xPixel) < 2) {
                        continue;
                    }
                    lastXPixel = xPixel;
                    // Draw line
                    ctx.fillRect(Math.round(xPixel - cfg.gridThickness * 0.5), 0, cfg.gridThickness, hPixel);
                }
            }
        }
        
        // Draw data set(s)
        for (var i = 0; i < this.dataSets.length; i++) {

            // Get data set
            var dataSet = this.dataSets[i];

            // Draw data set
            switch (dataSet.type) {
            case 'line':
                this.renderLineGraph(ctx, dataSet,i);
                break;
            case 'bar':
                this.renderBarGraph(ctx, dataSet);
                break;
            }
        }

        // Draw selection
        if (this.selecting) {
            ctx.fillStyle = 'rgba(31, 59, 226, 0.4)';
            var a = Math.min(this.selectA, this.selectB);
            var b = Math.max(this.selectA, this.selectB);
            switch (this.selecting) {
            case 'x':
                ctx.fillRect(a, 0, b - a, hPixel);
                break;
            case 'y':
                ctx.fillRect(0, a, wPixel, b - a);
                break;
            }
        }

        // Draw axes
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 1.0)';
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.shadowBlur = 4;
        ctx.fillStyle = cfg.fontColor;
        
        // Draw X labels (if present)
        for (var i = 0; i < this.dataSets.length; i++) {
            var dataSet = this.dataSets[i];
            
            // Do we have X labels?
            if (dataSet.xLabels) {
                var xLabels = dataSet.xLabels;
                var pixelPoints = dataSet.pixelPoints;
                
                // Draw labels
                var lastLabelX = -Number.MAX_VALUE; 
                for (var j = 0; j < pixelPoints.length; j++) {
                    // Skip labels if they're too close together (as specified by 'xLabelsSkipDistance')
                    if (Math.abs(pixelPoints[j].x - lastLabelX) < dataSet.xLabelsSkipDistance) {
                        continue;
                    }
                    lastLabelX = pixelPoints[j].x;
                    if (dataSet.xLabelsRotation && dataSet.xLabelsRotation != 0) {
                        // Draw rotated
                        var w = ctx.measureText(xLabels[j]).width;
                        var t = dataSet.xLabelsRotation;
                        var dy = Math.sin(t) * (w / Math.sin(Math.PI * 0.5));
                        ctx.save();
                        ctx.translate(pixelPoints[j].x, hPixel - cfg.marginY + dy);
                        ctx.rotate(t);
                        ctx.fillText(xLabels[j], -w, 0);
                        ctx.restore();
                    } else {
                        // Draw normal
                        this.renderText(pixelPoints[j].x, 'L', hPixel - cfg.marginY, 'T', true, xLabels[j]);
                    }
                }
            }
        } 
        
        // Draw X coordinates
        if (cfg.gridDrawVertical) {
            for (var x in gridCoordsX) {
                this.renderText(parseFloat(x), 'C', hPixel - cfg.marginY, 'T', false, this.round(gridCoordsX[x], cfg.digits));
            }
        }
        
        // Draw Y coordinates
        if (cfg.gridDrawHorizontal) {
            for (var y in gridCoordsY) {
                var yCoord = gridCoordsY[y];
                var suppress = (yCoord < 0 && cfg.hideNegativeYCoordinates);
                if (!suppress) {
                    this.renderText(cfg.marginX, 'R', parseFloat(y), 'C', false, this.round(yCoord, cfg.digits));
                }
            }
        }
        
        ctx.restore();
    }
}