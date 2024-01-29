(function(exports) {
	exports.Canvas = Canvas;

	// Extra mathematical/helper functions that will be useful - inspired by http://alexyoung.github.com/ico/
	var G = {};

	G.sum = function(a) {
		var i, sum;
		for (i = 0, sum = 0; i < a.length; sum += a[i++]) {};
		return sum;
	};

	if (typeof Array.prototype.max === 'undefined')
		G.max = function(a) { return Math.max.apply({}, a);};
	else
		G.max = function(a) { return a.max();};

	if (typeof Array.prototype.min === 'undefined')
		G.min = function(a) { return Math.min.apply({}, a);};
	else
		G.min = function(a) { return a.min(); };

	G.mean = function(a) {
		return G.sum(a) / a.length;
	};

	G.stddev = function(a) {
		return Math.sqrt(G.variance(a));
	};

	G.log10 = function(v) {
		return Math.log(v)/2.302585092994046;
	};

	G.variance = function(a) {
		let mean = G.mean(a), variance = 0;
		for (let i = 0; i < a.length; i++)
			variance += Math.pow(a[i] - mean, 2);
		return variance / (a.length - 1);
	};

	if (typeof Object.extend === 'undefined') {
		G.extend = function(destination, source) {
			for (let property in source) {
				if (source.hasOwnProperty(property)) destination[property] = source[property];
			}
			return destination;
		};
	} else G.extend = Object.extend;

	// We need to set up the canvas. This may mean attaching to an existing <div>
	// By the end of this function we have this.ctx available with events attached.
	// Make sure you have set the width/height of the canvas element
	function Canvas(input){

		this.id = (input && typeof input.id=="string") ? input.id : "LensToy";
		this.src = (input && typeof input.src=="string") ? input.src : "";
		this.width = (input && typeof input.width=="number") ? input.width : parseInt(getStyle(this.id, 'width'), 10);
		this.height = (input && typeof input.height=="number") ? input.height : parseInt(getStyle(this.id, 'height'), 10);
		this.events = { load:"", click:"", mousemove:"" };	// Let's define some events
		this.clipboard = {};
		this.clipboardData = {};

		// Now we want to build the <canvas> element that will hold our image
		var el = document.getElementById(this.id);
		//if(console && typeof console.log=="function") console.log('setup',el,id)
		if(el!=null){
			// Look for a <canvas> with the specified ID or fall back on a <div>
			if(typeof el=="object" && el.tagName != "CANVAS"){
				// Looks like the element is a container for our <canvas>
				el.setAttribute('id',this.id+'holder');
				let canvas = document.createElement('canvas');
				canvas.style.display='block';
				canvas.setAttribute('width',this.width);
				canvas.setAttribute('height',this.height);
				canvas.setAttribute('id',this.id);
				el.appendChild(canvas);
				// For excanvas we need to initialise the newly created <canvas>

			}else{
				// Define the size of the canvas
				// Excanvas doesn't seem to attach itself to the existing
				// <canvas> so we make a new one and replace it.
				el.setAttribute('width', this.width);
				el.setAttribute('height', this.height);
			}
			this.canvas = document.getElementById(this.id);
		}else
			this.canvas = el;
		this.ctx = (this.canvas) ? this.canvas.getContext("2d",{willReadFrequently:true}) : null;

		// The object didn't exist before so we add event listeners to it
		let _obj = this;
		addEvent(this.canvas,"click",function(e){
			// console.log("click event")
			_obj.getCursor(e);
			_obj.trigger("click",{x:_obj.cursor.x,y:_obj.cursor.y});
		});
		addEvent(this.canvas,"mousemove",function(e){
			// console.log("mousemove event")
			_obj.getCursor(e);
			_obj.trigger("mousemove",{x:_obj.cursor.x,y:_obj.cursor.y})
		});
		addEvent(this.canvas,"mouseout",function(e){
			// console.log("mouseout event")
			_obj.trigger("mouseout")
		});
		addEvent(this.canvas,"mouseover",function(e){
			// console.log("mouseover event")
			_obj.trigger("mouseover")
		});
		addEvent(this.canvas,"mousedown",function(e){
			// console.log("mousedown event")
			_obj.trigger("mousedown");
		});
		addEvent(this.canvas,"mouseup",function(e){
			// console.log("mouseup event")
			_obj.trigger("mouseup");
		})
		return this;
	}

	//清除画布上的内容
	Canvas.prototype.clear = function(){
		this.ctx.clearRect(0,0,this.width,this.height);
	}

	//将画布上的画进行模糊处理
	Canvas.prototype.blur = function(imageData, w, h){

		let steps = 3;
		let scale = 4;
		// Kernel width 0.9", trades off with alpha channel...
		let smallW = Math.round(w / scale);
		let smallH = Math.round(h / scale);

		let canvas = document.createElement("canvas");
		canvas.width = w;
		canvas.height = h;
		let ctx = canvas.getContext("2d");
		ctx.putImageData(imageData,0,0);

		let copy = document.createElement("canvas");
		copy.width = smallW;
		copy.height = smallH;
		let copyCtx = copy.getContext("2d");

		// Convolution with square top hat kernel, by shifting and redrawing image...
		// Does not get brightness quite right...
		for (let i=0; i<steps; i++) {
			let scaledW = Math.max(1,Math.round(smallW - 2*i));
			let scaledH = Math.max(1,Math.round(smallH - 2*i));

			copyCtx.clearRect(0,0,smallW,smallH);
			copyCtx.drawImage(canvas, 0, 0, w, h, 0, 0, scaledW, scaledH);
			ctx.drawImage(copy, 0, 0, scaledW, scaledH, 0, 0, w, h);
		}

		return ctx.getImageData(0, 0, w, h);

	}

	//将一个图像叠加到画布上
	Canvas.prototype.overlay = function(imageData){

		// Because of the way putImageData replaces all the pixel values,
		// we have to create a temporary canvas and put it there.
		let overlayCanvas = document.createElement("canvas");
		overlayCanvas.width = this.width;
		overlayCanvas.height = this.height;
		overlayCanvas.getContext("2d").putImageData(imageData, 0, 0);

		// Now we can combine the new image with our existing canvas
		// whilst preserving transparency
		this.ctx.drawImage(overlayCanvas, 0, 0);
	}

	Canvas.prototype.overlayFromClipboard = function(name){
		if(this.ctx){
			if(!name || typeof name!=="string") name = "default";
			if(!this.clipboard[name]) return this;

			this.overlay(this.clipboard[name]);
		}
		return this;
	}

	//将画布上的图像复制到剪贴板
	Canvas.prototype.copyToClipboard = function(name,img){
		if(this.ctx){
			if(!name || typeof name!=="string") name = "default";

			// Will fail if the browser thinks the image was cross-domain
			try {
				this.clipboard[name] = (img) ? img : this.ctx.getImageData(0, 0, this.width, this.height);
				this.clipboardData[name] = this.clipboard[name].data;
			}catch(e){}
		}
		return this;
	}

	//从剪贴板粘贴图像到画布上
	Canvas.prototype.pasteFromClipboard = function(name){
		if(this.ctx){
			if(!name || typeof name!=="string") name = "default";
			if(!this.clipboard[name]) return this;

			// Will fail if the browser thinks the image was cross-domain
			try {
				this.clipboard[name].data = this.clipboardData[name];
				this.ctx.putImageData(this.clipboard[name], 0, 0);
			}catch(e){}
		}
		return this;
	}

	//返回鼠标在画布上的位置
	Canvas.prototype.getCursor = function(e){
		this.cursor = {x: e.offsetX, y: e.offsetY};
		return this.cursor;

	}

	// Attach a handler to an event for the Canvas object in a style similar to that used by jQuery
	// 以类似于jQuery使用的样式为Canvas对象的事件附加处理程序
	// .bind(eventType[,eventData],handler(eventObject));
	// .bind("resize",function(e){ console.log(e); });
	// .bind("resize",{me:this},function(e){ console.log(e.data.me); });
	Canvas.prototype.bind = function(ev,e,fn){
		if(typeof ev!="string") return this;
		if(typeof fn==="undefined"){
			fn = e;
			e = {};
		}else{
			e = {data:e}
		}
		if(typeof e!="object" || typeof fn!="function") return this;
		// if(this.events[ev]) this.events[ev].push({e:e,fn:fn});
		if(this.events[ev]) this.events[ev][0] = {e:e,fn:fn};
		else this.events[ev] = [{e:e,fn:fn}];
		return this;
	}
	// Trigger a defined event with arguments. This is for internal-use to be
	// sure to include the correct arguments for a particular event
	Canvas.prototype.trigger = function(ev,args){
		if(typeof ev != "string") return;
		if(typeof args != "object") args = {};
		let o = [];
		if(typeof this.events[ev]=="object"){
			for(let i = 0 ; i < this.events[ev].length ; i++){
				let e = G.extend(this.events[ev][i].e,args);
				if(typeof this.events[ev][i].fn == "function") o.push(this.events[ev][i].fn.call(this,e))
			}
		}
		if(o.length > 0) return o;
	}



	// Helpful functions

	// Cross-browser way to add an event
	if(typeof addEvent!="function"){
		function addEvent(oElement, strEvent, fncHandler){
			if(!oElement) return;
			if(oElement.addEventListener) oElement.addEventListener(strEvent, fncHandler, false);
			else if(oElement.attachEvent) oElement.attachEvent("on" + strEvent, fncHandler);
		}
	}

	function trim(s) {
		s = s.replace(/(^\s*)|(\s*$)/gi,"");
		s = s.replace(/[ ]{2,}/gi," ");
		s = s.replace(/\n /,"\n");
		return s;
	}

	// A non-jQuery dependent function to get a style
	// 获取元素的样式
	function getStyle(el, styleProp) {
		if (typeof window === 'undefined') return;
		var style;
		var el = document.getElementById(el);
		if(!el) return null;
		if(el.currentStyle) style = el.currentStyle[styleProp];
		else if (window.getComputedStyle) style = document.defaultView.getComputedStyle(el, null).getPropertyValue(styleProp);
		if(style && style.length === 0) style = null;
		return style;
	}
})(typeof exports !== "undefined" ? exports : window);
