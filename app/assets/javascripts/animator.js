var ANIMATOR = {};

//
// Animator class
//

/* The following are the properties used to configure an animation:
 *    Property       Description
 *    --------       -----------
 *    to             start value
 *    from           end value
 *    duration       duration of the animation in ms
 *    delay          delay in ms before the start of the animation
 *    easing         constant that specifies the easing style 
 *    object         the object containing the property to be modified by the animation
 *    property       string representing the name of the property to be modified
 *    onComplete     callback function when the animation has complete
 *    nextAnimation  triggers another animation upon completion
 */

ANIMATOR.EASE_OUT_LINEAR  = 1;
ANIMATOR.EASE_OUT_QUAD    = 2;
ANIMATOR.EASE_OUT_CUBIC   = 3;
ANIMATOR.EASE_OUT_QUART   = 4;
ANIMATOR.EASE_OUT_QUINT   = 5;
ANIMATOR.EASE_IN_OUT_QUAD = 6;

ANIMATOR.Animator = function () {
    this.animations = {};
    this.animatorId = 'animator-' + Date.now() + '-' + Math.round(Math.random() * 0xffffffff);
}
ANIMATOR.Animator.prototype = {
    constructor : ANIMATOR.Animator,
    animate : function (anim) {
        anim.t0 = Date.now();
        if (!anim.from) {
            anim.from = anim.object[anim.property];
        }
        if (!anim.object[this.animatorId]) {
            anim.object[this.animatorId] = {};
        }
        var key = anim.object[this.animatorId][anim.property];
        if (!key) {
            key = 'key-' + anim.property + '-' + Date.now() + '-' + Math.round(Math.random() * 0xffffffff);
            anim.object[this.animatorId][anim.property] = key;
        }
        this.animations[key] = anim;

        // Return the key so that the animation may later be halted
        return key;
    },
    activeCount: function() {
        var count = 0;
        for (var key in this.animations) {
            count++;
        }
        return count;
    },
    tick : function () {
        var count = 0;
        var removeKeys = [];
        for (var key in this.animations) {
            count++;
            var anim = this.animations[key];
            var delay = anim.delay ? anim.delay : 0;
            var dt = (Date.now() - anim.t0 - delay) / anim.duration;
            var val;
            if (dt >= 1.0) {
                if (anim.onComplete) {
                    anim.onComplete();
                }
                removeKeys.push(key);
                val = anim.to;
            } else if (dt < 0) {
                val = anim.from;
            } else {
                var t = dt;
                var easing = anim.easing ? anim.easing : ANIMATOR.EASE_OUT_CUBIC;
                var tEase = t;
                switch (easing) {
                    case ANIMATOR.EASE_OUT_QUAD: 
                        tEase = -t * (t - 2.0); 
                        break;
                    case ANIMATOR.EASE_OUT_CUBIC: 
                        var tmp = t - 1.0;
                        tEase = tmp * tmp * tmp + 1.0;
                        break;
                    case ANIMATOR.EASE_OUT_QUART:
                        var tmp = t - 1.0;
                        tEase = -(tmp * tmp * tmp * tmp - 1.0);
                        break;
                    case ANIMATOR.EASE_OUT_QUINT: 
                        var tmp = t - 1.0;
                        tEase = (tmp * tmp * tmp * tmp * tmp + 1.0);
                        break;
		    case ANIMATOR.EASE_IN_OUT_QUAD:
                        var tmp = t * 2.0;
                        if(tmp < 1.0) tEase = 0.5 * tmp * tmp;
                        else tEase = -0.5 * ((tmp - 1.0) * (tmp - 3.0) - 1.0);
		        break;
                }       
                val = anim.from + (anim.to - anim.from) * tEase;
            }
            anim.object[anim.property] = val;
        }
        
        for (var i = 0; i < removeKeys.length; i++) {
            var anim = this.animations[removeKeys[i]];
            delete this.animations[removeKeys[i]];

            if(anim.nextAnimation) {
                this.animate(anim.nextAnimation);
            }
        }

        return (count > 0);
    },
    halt: function(key) {
        delete this.animations[key];
    }
}