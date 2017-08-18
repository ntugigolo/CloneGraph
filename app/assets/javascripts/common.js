var COMMON = {};

//
// XHR
//
COMMON.XHR = function(url, onSuccess, onError) {
    this.url = url;
    this.onSuccess = onSuccess;
    this.onError = onError;

    
    var context = this;
    
    var doSuccess = function(result) {
        if (context.onSuccess) {
            context.onSuccess(result);
        }
        context.xhr = undefined;
    }
    
    var doError = function() {
        if (context.onError) {
            context.onError();
        }
    }
    
    var doRetry = function(url) {
        if (!context.xhr) {
            // User aborted the operation - do not attempt more retries
            return; 
        }
        // Wait for a little while
        var delay = Math.round(250 + Math.random() * 250);
        setTimeout(function() {
            // Retry
            doXHR(url);
        }, delay);
    }
    
    var doXHR = function(url) {
        context.xhr = new XMLHttpRequest();
        context.xhr.open('GET', url, true);
        context.xhr.send();
        context.xhr.onerror = doError;
        context.xhr.onreadystatechange = function() {
            if (!context.xhr) {
                return;
            }
            if (context.xhr.readyState != 4) {
                return;
            }
            switch (context.xhr.status) {
                case 200: doSuccess(context.xhr.responseText); break;
                case 503: console.warn('Status 503 - retrying: ' + url); doRetry(url); break;
                default: console.error('Status ' + context.xhr.status + ': ' + url); doError(); break;
            }
        }
    }
    
    var delay = Math.round(Math.random() * 250);
    setTimeout(function() {
        doXHR(url);
    }, delay);
}
COMMON.XHR.prototype = {
    constructor: COMMON.XHR,    
    abort: function() {
        if (this.xhr) {
            this.xhr.onreadystatechange = undefined;
            this.xhr.onerror = undefined;
            this.xhr.abort();
            this.xhr = undefined;
        }
    },
}

//
// Dialog
//
COMMON.FLYOUT_POSITION_CENTERSCREEN = 0;
COMMON.FLYOUT_POSITION_LEFT = 1;
COMMON.FLYOUT_POSITION_CENTER = 2;
COMMON.FLYOUT_POSITION_BELOW = 3;

COMMON.FLYOUT_ANIMATION_ZOOM = 0;
COMMON.FLYOUT_ANIMATION_SLIDELEFT = 1;
COMMON.FLYOUT_ANIMATION_SLIDEDOWN = 2;

COMMON.Flyout = function(domElement, config) {
    
    // Configuration
    this.config = {
        darkenBackground: true,
        associatedDomElement: undefined,
        animation: COMMON.FLYOUT_ANIMATION_ZOOM,
        position: COMMON.FLYOUT_POSITION_CENTERSCREEN,
        onClickOutside: undefined,
    };
    if (config) {
        for (var key in config) {
            this.config[key] = config[key];
        }
    }
    
    var context = this;
    this.domElement = domElement;
    
    // Create background
    this.domBackground = document.createElement('div');
    this.domBackground.style.position = 'fixed';
    this.domBackground.style.top = '0px';
    this.domBackground.style.left = '0px';
    this.domBackground.style.background = this.config.darkenBackground ? 'rgba(0, 0, 0, 0.65)' : 'rgba(0, 0, 0, 0)';
    this.domBackground.style.opacity = 0;
    this.domBackground.style.transition = 'opacity 0.2s ease-out';
    this.domBackground.style.zIndex = 20;
    this.moveOutOfView(this.domBackground);
    
    // Create outer element
    this.domOuter = document.createElement('div');
    this.domOuter.style.position = 'absolute';
    this.domOuter.style.top = '0px';
    this.domOuter.style.left = '0px';
    this.moveOutOfView(this.domOuter);
    
    // Create inner element
    this.domInner = document.createElement('div');
    this.domInner.style.transition = 'opacity 0.2s ease-out, transform 0.2s ease-out';
    this.hide();
    
    // Move element out of the way after hide animation
    this.domInner.addEventListener('transitionend', function(e) {
        if (e.propertyName == 'opacity' && !context.visible) {
            context.moveOutOfView(context.domBackground);
            context.moveOutOfView(context.domOuter);
        }
    });
    
    // Create DOM hierarchy
    var parent = domElement.parentNode;
    if(!parent) {
        document.body.appendChild(domElement);
        parent = document.body;
    }
    parent.removeChild(domElement);
    this.domInner.appendChild(domElement);
    this.domOuter.appendChild(this.domInner);
    this.domBackground.appendChild(this.domOuter);
    parent.appendChild(this.domBackground);

    // Reposition on resize
    window.addEventListener('resize', function() { 
        if (context.visible) {
            context.position();
        }
    });
    
    // Hide on 'click outside'
    this.domBackground.addEventListener('mousedown', function(e) {
        if (context.visible) {
            var rect = context.domOuter.getBoundingClientRect();
            var hit = (e.clientX > rect.left && e.clientX < rect.right && e.clientY > rect.top & e.clientY < rect.bottom);
            if (!hit) {
                context.hide();
                e.preventDefault();
                if(config.onClickOutside) config.onClickOutside();
            }
        }
    });
}
COMMON.Flyout.prototype = {
    constructor: COMMON.Flyout,
    moveOutOfView: function(domElement) {
        domElement.style.transform = 'translate(-20000px, -20000px)';
    },
    position: function() {
        this.domBackground.style.width = window.innerWidth + 'px';
        this.domBackground.style.height = window.innerHeight + 'px';
        this.domBackground.style.transform = 'translate(0px, 0px)';

        // Many browsers cannot use position: fixed if the element also has any transforms (acknowledged bug)
        // This is a browser-independent solution to effectively achieve {position: fixed, top: 0px, left: 0px}
        var domBackgroundRect = this.domBackground.getBoundingClientRect();
        this.domBackground.style.transform = 'translate(' + (-1 * domBackgroundRect.left) + 'px, ' + (-1 * domBackgroundRect.top) + 'px)';
        
        var rect = this.domOuter.getBoundingClientRect();
        var associated = this.config.associatedDomElement;
        var x, y;
        
        var associatedRect;
        if (associated) {
            associatedRect = associated.getBoundingClientRect();
        }
        
        switch (this.config.position) {
            
            case COMMON.FLYOUT_POSITION_CENTERSCREEN:
                x = (window.innerWidth - rect.width) * 0.5;
                y = (window.innerHeight - rect.height) * 0.5;
                break;
            
            case COMMON.FLYOUT_POSITION_CENTER:
                x = associatedRect.left + (associatedRect.width - rect.width) * 0.5;
                y = associatedRect.top + (associatedRect.height - rect.height) * 0.5;
                break;
                
            case COMMON.FLYOUT_POSITION_BELOW:
                x = associatedRect.left;
                y = associatedRect.top + associatedRect.height;
                break;
            
            case COMMON.FLYOUT_POSITION_LEFT:
                x = associatedRect.left - rect.width;
                y = associatedRect.top + (associatedRect.height - rect.height) * 0.5;
                break;
        }
        
        x = Math.min(x, window.innerWidth - rect.width);
        y = Math.min(y, window.innerHeight - rect.height);
        
        x = Math.max(x, 0);
        y = Math.max(y, 0);
        
        this.domOuter.style.transform = 'translate(' + Math.round(x) + 'px, ' + Math.round(y) + 'px)';
    },
    closeObserver: function() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = undefined;
        }
    },
    show: function() {
        var context = this;
        this.closeObserver();
        this.observer = new MutationObserver(function(e) {
            context.position();
        });
        this.observer.observe(this.domElement, {subtree: true, childList: true});
        this.position();
        this.domBackground.style.opacity = 1;
        this.domInner.style.opacity = 1;
        this.visible = true;
        
        switch (this.config.animation) {
            case COMMON.FLYOUT_ANIMATION_ZOOM:
                this.domInner.style.transform = 'scale(1.0, 1.0)';
                break;
            case COMMON.FLYOUT_ANIMATION_SLIDELEFT:
                this.domInner.style.transform = 'translate(0px, 0px)';
                break;
            case COMMON.FLYOUT_ANIMATION_SLIDEDOWN:
                this.domInner.style.transform = 'translate(0px, 0px)';
                break;
        }
    },
    hide: function() {
        this.closeObserver();
        this.domBackground.style.opacity = 0;
        this.domInner.style.opacity = 0;
        this.visible = false;
        
        switch (this.config.animation) {
            case COMMON.FLYOUT_ANIMATION_ZOOM:
                this.domInner.style.transform = 'scale(0.95, 0.95)';
                break;
            case COMMON.FLYOUT_ANIMATION_SLIDELEFT:
                this.domInner.style.transform = 'translate(20px, 0px)';
                break;
            case COMMON.FLYOUT_ANIMATION_SLIDEDOWN:
                this.domInner.style.transform = 'translate(0px, -20px)';
                break;
        }
    },
}
//
// Clone DOM element
//
COMMON.cloneElement = function(domElement) {
    var clone = domElement.cloneNode(true);
    var idMap = {};
    var unique = Date.now().toString() + Math.round(Math.random() * 0xffffffff).toString();
    
    var fixIds = function(e) {
        if (e.id) {
            idMap[e.id] = e;
            e.id = e.id + unique;
        }
        for (var i = 0; i < e.children.length; i++) {
            fixIds(e.children[i]);
        }
    }
    
    fixIds(clone);
    
    clone.getElementById = function(id) {
        return idMap[id];
    }
    
    return clone;
}

//
// Get query parameters
//
COMMON.getQueryParameters = function() {
    var result = {};
    var params = location.search;
    var idx = params.lastIndexOf('?');
    if (idx >= 0) {
        var str = params.substr(idx + 1);
        var arr0 = str.split('&');
        for (var i = 0; i < arr0.length; i++) {
            var str0 = arr0[i];
            var idx0 = str0.indexOf('=');
            if (idx >= 0) {
                result[str0.substring(0, idx0)] = str0.substr(idx0 + 1);
            } else {
                result[str0] = true;
            }
        }
    }
    return result;
}

//
// CSS class manipulation
//
COMMON.manipulateClass = function(domElement, callback) {
    var arr = [];
    if (domElement.className) {
        var arr = domElement.className.split(' ');
    }
    var names = {};
    for (var i = 0; i < arr.length; i++) {
        names[arr[i]] = true;
    }
    callback(names);
    var newClassName = '';
    for (var name in names) {
        newClassName += name + ' ';
    }
    domElement.className = newClassName;
}
COMMON.addClass = function(domElement, className) {
    var result = false;
    COMMON.manipulateClass(domElement, function(names) {
        if (!(className in names)) {
            names[className] = true;
            result = true;
        }
    });
    return result;
}
COMMON.removeClass = function(domElement, className) {
    var result = false;
    COMMON.manipulateClass(domElement, function(names) {
        if (className in names) {
            delete names[className];
            result = true;
        }
    });
    return result;
}