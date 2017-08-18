// This is a manifest file that'll be compiled into application.js, which will include all the files
// listed below.
//
// Any JavaScript/Coffee file within this directory, lib/assets/javascripts, vendor/assets/javascripts,
// or vendor/assets/javascripts of plugins, if any, can be referenced here using a relative path.
//
// It's not advisable to add code directly here, but if you do, it'll appear at the bottom of the
// the compiled file.
//
// WARNING: THE FIRST BLANK LINE MARKS THE END OF WHAT'S TO BE PROCESSED, ANY BLANK LINE SHOULD
// GO AFTER THE REQUIRES BELOW.
//
//= require three.min.js
//= require_tree .
           'use strict';
        
            var MAINPAGE = {};
            
            //
            // Polyfills
            //
            MAINPAGE.polyFills = function() {
                
                // Polyfill for String::endsWith
                if (!String.prototype.endsWith) {
                    String.prototype.endsWith = function(searchString, position) {
                        var subjectString = this.toString();
                        if (typeof position !== 'number' || !isFinite(position) || Math.floor(position) !== position || position > subjectString.length) {
                            position = subjectString.length;
                        }
                        position -= searchString.length;
                        var lastIndex = subjectString.indexOf(searchString, position);
                        return lastIndex !== -1 && lastIndex === position;
                    };
                }
                
                // Polyfill for String::startsWith
                if (!String.prototype.startsWith) {
                    String.prototype.startsWith = function(searchString, position){
                      position = position || 0;
                      return this.substr(position, searchString.length) === searchString;
                  };
                }
                
                // Polyfill for String::includes
                if (!String.prototype.includes) {
                    String.prototype.includes = function() {
                        'use strict';
                        if (typeof arguments[1] === "number") {
                            if (this.length < arguments[0].length + arguments[1].length) {
                                return false;
                            } else {
                                if (this.substr(arguments[1], arguments[0].length) === arguments[0]) return true;
                                else return false;
                            }
                        } else {
                            return String.prototype.indexOf.apply(this, arguments) !== -1;
                        }
                    };
                }
            }
            
            //
            // Hide 'log roller' banner
            //
            MAINPAGE.hideBanner = function() {
                var banner = document.getElementById('MAINPAGELogRollerActivity');
                var width = banner.getBoundingClientRect().width;
                banner.style.opacity = 0;
                banner.style.transform = 'translate(' + width + 'px, 0px)';
            }
            
            //
            // Show 'log roller' banner
            //
            MAINPAGE.showBanner = function() {
                var banner = document.getElementById('MAINPAGELogRollerActivity');
                banner.style.opacity = 1;
                banner.style.transform = 'translate(0px, 0px)';
            }
            
            //
            // Page load context (allows page to control spinner/load behavior)
            //
            MAINPAGE.pageLoadContext = {
                hidePage: false,
                busy: false,
                reset: function() {
                    this.hidePage = false;
                    this.busy = false;
                },
                appearBusy: function(hidePage) {
                    this.hidePage = hidePage;
                    this.busy = true;
                    var spinner = document.getElementById('MAINPAGESpinnerContainer');
                    spinner.style.opacity = 1;
                    if (hidePage) {
                        MAINPAGE.hidePageContainer();
                    } 
                },
                appearReady: function() {
                    this.busy = false;
                    MAINPAGE.showPageContainer();
                    var spinner = document.getElementById('MAINPAGESpinnerContainer');
                    spinner.style.opacity = 0;
                },
            };
            
            //
            // Called on page initial page load
            //
            MAINPAGE.init = function() {

                // Polyfills
                MAINPAGE.polyFills();
            
                // Hide banner
                MAINPAGE.hideBanner();
            
                // Create menu
                MAINPAGE.menu = new MENU.Menu(
                    {id: 'mainMenu', items: [
                        {title: 'Shoes', subMenu : {id: 'TimesMenuShoes', items: [] }},
                        {title: 'Apparel', subMenu : {id: 'TimesMenuApparel', items: [] }},
                        {title: 'Books/Media', subMenu : {id: 'TimesMenuBooks', items: [] }},
                        {title: 'Alarm Settings', url: 'alarm_setting.html'}
                    ]});
                
                MAINPAGE.menu.onClickUrl = function(url) {
                    MAINPAGE.loadPage(url);
                }
                
                var items = [
                            {title: 'Weekly', url: 'shoes_real_time.html'},
                            {title: 'Yearly', url: 'shoes_long_time.html'},
                            {title: 'Studios', url: 'shoes_studios.html'}
                    ];
                MAINPAGE.menu.appendItems('TimesMenuShoes', items);   
                items = [
                            {title: 'Weekly', url: 'apparel_real_time.html'},
                            {title: 'Yearly', url: 'apparel_long_time.html'},
                            {title: 'Studios', url: 'apparel_studios.html'}
                    ];
                MAINPAGE.menu.appendItems('TimesMenuApparel', items);
                items = [
                            {title: 'Weekly', url: 'books_real_time.html'},
                            {title: 'Yearly', url: 'books_long_time.html'},
                            {title: 'Studios', url: 'books_studios.html'}
                    ];
                MAINPAGE.menu.appendItems('TimesMenuBooks', items);
                
                // Create page loader
                MAINPAGE.pageLoader = new PAGELOADER.PageLoader();
                
                MAINPAGE.pageLoader.injectScriptOnPageLoad = function() {
                    MAINPAGE.pageLoadContext.reset();
                    return 'if (typeof(onPageLoad) == "function") { onPageLoad(MAINPAGE.pageLoadContext); }';
                }
                
                // Handle reload
                MAINPAGE.loadPage(document.URL, true);
                
                // Handle 'back' button
                window.addEventListener('popstate', function(e) {
                    MAINPAGE.loadPage(document.URL, true);
                });
            }
            
            //
            // Hide page container
            //
            MAINPAGE.hidePageContainer = function() {
                var container = document.getElementById('MAINPAGEPageContainer');
                container.style.pointerEvents = 'none';
                container.style.opacity = 0;
            }
            
            //
            // Show page container
            //
            MAINPAGE.showPageContainer = function() {
                var container = document.getElementById('MAINPAGEPageContainer');
                container.style.pointerEvents = 'auto';
                container.style.opacity = 1;
            }
            
            //
            // Load page helper function
            //
            MAINPAGE.loadPage = function(url, bypassHistory) {
                
                if (url) {
                    var m = url.match(/http?:\/\/[a-zA-Z0-9\.\-:]+\/\?p=(.*)/);
                    if (m) {
                        url = m[1];
                    }
                    if (url.indexOf('://') >= 0) {
                        url = undefined;
                    }
                } 
                
                if (!url) {
                    url = 'shoes_real_time.html'; // Default page
                }
                
                if (!bypassHistory) {
                    var baseUrl = document.URL.split('?')[0];
                    history.pushState({}, "", baseUrl + '?p=' + url);
                }
                                
                // Get DOM elements
                var container = document.getElementById('MAINPAGEPageContainer');
                var spinner = document.getElementById('MAINPAGESpinnerContainer');
                
                // Show spinner
                spinner.style.opacity = 1;
                
                // Helper function for page fetching
                var fetch = function() {
                    
                    // Don't start multiple page-loads simultaneously
                    if (MAINPAGE.loading) {
                        console.warn('Cannot load new page while previous page load is still ongoing');
                        return;
                    }
                    MAINPAGE.loading = true;
                    
                    MAINPAGE.pageLoader.loadPage(
                        url, 
                        container, 
                        // On success
                        function() {
                           
                            // We got the page - now fade it in (and reset scroll)
                            window.scrollTo(0,0);
                            if (!MAINPAGE.pageLoadContext.busy) {
                                spinner.style.opacity = 0;
                            }
                            if (!MAINPAGE.pageLoadContext.hidePage) {
                                MAINPAGE.showPageContainer();
                            }
                            MAINPAGE.loading = false;
                        },
                        // On error
                        function() {
                            console.error('Failed to load page: ' + url);
                            window.scrollTo(0,0);
                            MAINPAGE.showPageContainer();
                            spinner.style.opacity = 0;
                            MAINPAGE.loading = false;
                        }
                    );
                }
                
                if (container.style.opacity == 0) {
                    // If opacity is already zero, we fetch immediately
                    fetch();
                } else {
                    // Otherwise we fade the old page out before fetching the new
                    var beginFetch = function(e) {
                        if (e.target == container && e.propertyName == 'opacity') {
                            container.removeEventListener('transitionend', beginFetch);
                            fetch();
                        }
                    }
                    container.addEventListener('transitionend', beginFetch);
                    MAINPAGE.hidePageContainer();
                }
            }
            
            //
            // Helper functions for pages
            //
            var PAGEMANAGER = {}
            PAGEMANAGER.load = function(url) {
                MAINPAGE.loadPage(url, false);
            }
            PAGEMANAGER.hideAndSpin = function() {
                var container = document.getElementById('MAINPAGEPageContainer');
                var spinner = document.getElementById('MAINPAGESpinnerContainer');
                MAINPAGE.hidePageContainer();
                spinner.style.opacity = 1;
            }

