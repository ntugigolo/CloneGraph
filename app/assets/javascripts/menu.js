var MENU = {};

MENU.Menu = function(itemTree) {
    this.menusById = {};
    this.initialize(itemTree);
    this.menuStack = [];
}
MENU.Menu.prototype = {
    constructor: MENU.Menu,
    initialize: function(itemTree) {
        var context = this;
        window.addEventListener('resize', function() { context.resize(); });
        window.addEventListener('mousedown', function(e) { context.mouseDown(e); });
        this.topLevelId = this.createMenu(itemTree, 0);
    },
    resize: function() {
        for (var i = 0; i < this.menuStack.length; i++) {
            this.setElementHeight(this.menuStack[i]);
            this.scroll(this.menuStack[i], 0);
        }
    },
    mouseDown: function(e) {
        var maxX = 0;
        for (var i = 0; i < this.menuStack.length; i++) {
            var rect = this.menuStack[i].getBoundingClientRect();
            maxX = Math.max(maxX, rect.right);
        }
        if (e.clientX > maxX) {
            this.hideUntil();
        }
    },
    setElementHeight: function(element, height) {
        var winHeight = window.document.documentElement.clientHeight;
        element.style.height = winHeight + 'px';
        var rect = element.getBoundingClientRect();
        var delta = winHeight - rect.height;
        var finalHeight = winHeight + delta;
        element.style.height = finalHeight + 'px';
    },
    setElementWidth: function(element, width) {
        var winWidth = window.document.documentElement.clientWidth;
        element.style.height = winWidth + 'px';
        var rect = element.getBoundingClientRect();
        var delta = winWidth - rect.width;
        var finalWidth = winWidth + delta;
        element.style.Width = finalWidth + 'px';
    },
    scroll: function(menu, direction) {
        var e = menu.innerMenu;
        var scrollPos = (e.scrollPos) ? e.scrollPos : 0;
        
        scrollPos += direction * 200;
        
        var viewHeight = menu.getBoundingClientRect().height;
        var virtualHeight = e.getBoundingClientRect().height;

        scrollPos = Math.min(scrollPos, virtualHeight - viewHeight);
        scrollPos = Math.max(scrollPos, 0);

        e.style.transform = 'translate(0px, -' + scrollPos + 'px)';
        e.scrollPos = scrollPos;
    },
    appendItems: function(id, items) {
        var menu = this.menusById[id];
        for (var i = 0; i < items.length; i++) {
            // Create DOM element for item
            var item = document.createElement('div');
            if (items[i].subMenu) {
                item.className = 'MENUMenuItemSubMenuInactive';
                var innerItem = document.createElement('div');
                innerItem.className = 'MENUMenuItem';
                innerItem.innerHTML = items[i].title;
                item.appendChild(innerItem);
            } else {
                item.className = 'MENUMenuItem MENUMenuItemUrl';
                item.innerHTML = items[i].title;
            }
            menu.innerMenu.appendChild(item);
            // Assign click handlers
            var context = this;
            if (items[i].url) {
                (function(url) {
                    item.addEventListener('click', function() {
                        context.activateUrl(url);
                    });}
                )(items[i].url);
            } else if (items[i].onClick) {
                (function(onClick, param) {
                    item.addEventListener('click', function() {
			    context.activateOnClick(onClick, param);
                    });}
		)(items[i].onClick, items[i].param);
            } else if (items[i].subMenu) {
                var subMenuId = this.createMenu(items[i].subMenu, menu.menuLevel + 1, menu);
                (function(subMenuId, menu, item) {
                    item.addEventListener('click', function() {
                        context.deactivateAllSubMenus(menu);
                        COMMON.removeClass(item, 'MENUMenuItemSubMenuInactive');
                        COMMON.addClass(item, 'MENUMenuItemSubMenuActive');
                        context.activateSubMenu(subMenuId);
                    });}
                )(subMenuId, menu, item);
            }
        }
    },
    createMenu: function(root, level, parent) {
        // Create DOM element for menu
        var zIndex = 10000 - level;
        var menu = document.createElement('div');
        var innerMenu = document.createElement('div');
        menu.menuLevel = level;
        menu.parentMenu = parent;
        menu.appendChild(innerMenu);
        menu.innerMenu = innerMenu;
        document.body.appendChild(menu);
        // Listen for mousewheel events
        var context = this;
        menu.addEventListener('wheel', function(e) { context.scroll(menu, e.deltaY < 0 ? -1 : 1); e.preventDefault(); });
        // Store menu by ID
        this.menusById[root.id] = menu;
        // Create menu items
        this.appendItems(root.id, root.items);

        // Initialize menu style
        menu.style.position = 'fixed';
        menu.style.top = '0px';
        menu.style.left = '0px';
        menu.style.opacity = 0;
        menu.style.display = 'none';
        menu.style['z-index'] = zIndex;
        menu.className = 'MENUMenu';
        // Return menu ID
        return root.id;
    },
    addRefreshToggle: function() {
        var menu = this.menusById[this.topLevelId];
        var refreshToggle = document.createElement('div');
        refreshToggle.className = 'MENUMenuItem';
        
        refreshToggle.innerHTML = 'Refresh ' + (getShouldRefresh() ? ' [ON] ' : ' [OFF] ');
        refreshToggle.addEventListener('click', function() {
            toggleShouldRefresh();
            refreshToggle.innerHTML = 'Refresh ' + (getShouldRefresh() ? ' [ON] ' : ' [OFF] ');
        });

        menu.appendChild(refreshToggle);
    },
    deactivateAllSubMenus: function(menu) {
        for (var i = 0; i < menu.innerMenu.children.length; i++) {
            var child = menu.innerMenu.children[i];
            if (COMMON.removeClass(child, 'MENUMenuItemSubMenuActive')) {
                COMMON.addClass(child, 'MENUMenuItemSubMenuInactive');
            }
        }
    },
    show: function() {
        this.showMenuById(this.topLevelId);
    },
    showMenuById: function(id) {
        var menu = this.menusById[id];
        var context = this;
        this.hideUntil(menu.parentMenu, function() {
            if (!menu.showing) {
                context.menuStack.push(menu);
                menu.showing = true;
                var x = (menu.parentMenu) ? menu.parentMenu.getBoundingClientRect().right : 0;
                menu.style.display = 'block';
                menu.style.transition = undefined;
                menu.style.left =  x + 'px';
                menu.style.transform = 'translate(-' + menu.getBoundingClientRect().width + 'px, 0px)';
                getComputedStyle(menu).transform;
	        menu.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
	        menu.style.transform = 'translate(0px, 0px)';
		menu.style.opacity = 1;
	//	context.setElementHeight(menu);
        context.setElementWidth(menu);
            }
        });
    },
    hideUntil: function(targetMenu, onComplete) {
        var context = this;
        function doHide(index) {
            if (index < 0 || context.menuStack[index] == targetMenu) {
                if (onComplete) {
                    onComplete();
                }
            } else {
                var menu = context.menuStack.pop();
                context.hideMenu(menu, function() {
                    doHide(--index);
                });
            }
        }
        doHide(this.menuStack.length - 1);
    },
    hideMenu: function(menu, onComplete) {
        if (menu && menu.showing) {
            this.deactivateAllSubMenus(menu);
            menu.showing = false;
            menu.style.transition = 'opacity 0.2s ease-out, transform 0.2s ease-out';
            menu.style.transform = 'translate(-' + menu.getBoundingClientRect().width + 'px, 0px)';
            menu.style.opacity = 0;
            var transitionEnd = function(e) {
                if (e.propertyName == 'opacity' || e.propertyName == 'transform') {
                    menu.removeEventListener('transitionend', transitionEnd);
                    menu.style.display = 'none';
                    onComplete();
                }
            }
            menu.addEventListener('transitionend', transitionEnd);
        }
    },
    activateOnClick: function(onClick, param) {
        this.hideUntil();
        if (onClick) {
            onClick(param);
        }
    },
    activateUrl: function(url) {
        this.hideUntil();
        if (this.onClickUrl) {
            this.onClickUrl(url);
        }
    },
    activateSubMenu: function(id) {
        this.showMenuById(id);
    },
}
