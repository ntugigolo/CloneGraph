var PAGELOADER = {};

//
// Page loader class
//
PAGELOADER.PageLoader = function() {
}
PAGELOADER.PageLoader.prototype = {
    // Generic download function
    download: function (url, onSuccess, onError) {
        
        // Append random numbers to bypass cache
        url += url.includes('?') ? '&' : '?';
        url += Date.now();
        
        // Cancel ongoing request
        if (this.xhr) {
            this.xhr.abort();
            this.xhr = undefined;
        }
        
        // Download URL asynchronously
        this.xhr = new COMMON.XHR(
            url, 
            // On success
            function(response) {
                if (onSuccess) {
                    onSuccess(response, url);
                }
            },
            // On error
            function() {
                if (onError) {
                    onError(url);
                }
            }
        );
    },
    injectCode: function(domElement, code) {
        var s = document.createElement('script');
        domElement.appendChild(s);
        try {
            s.appendChild(document.createTextNode(code));
        } catch (ex) {
            s.text = code;
        }
    },
    // Inject scripts
    injectScripts: function(domElement, oncomplete) {
        
        // Get all script elements
        var elements = domElement.getElementsByTagName('script');
        var elementsSource = [];
        var elementsContent = [];
        for (var i = 0; i < elements.length; i++) {
            var e = elements[i];
            if (e.src) {
                elementsSource.push(e);
            }
            if (e.innerHTML) {
                elementsContent.push(e);
            }
        }
        
        // Delete script elements (since the browser will not execute them)
        while (elements[0]) {
            elements[0].parentNode.removeChild(elements[0])
        }
        
        //
        // Re-insert the script elements, this will force the browser to execute them
        //
        
        // Helper function: Load JS content
        var context = this;
        var loadContent = function() {
            for (var i = 0; i < elementsContent.length; i++) {
                context.injectCode(domElement, elementsContent[i].innerHTML);
            }
            oncomplete()
        }
        
        // Helper function: Load external JS source files
        var loadSource = function(index) {
            if (index >= elementsSource.length) {
                loadContent();
                return;
            }
            var e = elementsSource[index];
            var s = document.createElement('script');
            domElement.appendChild(s);
            s.setAttribute('src', e.src);
            s.onload = function() {
                loadSource(++index);
            }
        }
        
        // Start loading (we begin with source files and move on to content)
        loadSource(0);
    },
    // Load page
    loadPage: function(url, domTarget, onSuccess, onError) {
    
        // Unload current page
        while (domTarget.children.length > 0) {
            var currentDiv = domTarget.children[0];
            
            // Inject script on unload
            if (this.injectScriptOnPageUnload) {
                var code = this.injectScriptOnPageUnload();
                this.injectCode(currentDiv, code);
            }
            
            // Remove element
            domTarget.removeChild(currentDiv);
        }
    
        // Download HTML page
        var context = this;
        this.download(
            url, 
            // On success
            function(html) {
            
                // Create DOM element from HTML and append it to the target
                var newDiv = document.createElement('div');
                newDiv.style.height = '100%'; // Note: Hack
                newDiv.innerHTML = html;
                domTarget.appendChild(newDiv);
                
                // Inject scripts from the downloaded HTML page
                context.injectScripts(newDiv, function() {
                    
                    // Inject script on page load
                    if (context.injectScriptOnPageLoad) {
                        var code = context.injectScriptOnPageLoad();
                        context.injectCode(newDiv, code);
                    }
                
                    // Callback
                    if (onSuccess) {
                        onSuccess();
                    }
                });
            },
            // On error
            function() {
                if (onError) {
                    onError();
                }
            }
        );
    },
}