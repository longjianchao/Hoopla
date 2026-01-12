/*
 * Javascript Lens Modeling
 *
 * 2013 Phil Marshall & Stuart Lowe
 * 2016 Nan Li
 *
 * Licensed under MIT
 *
 * Requires lens.js, from https://raw.github.com/slowe/lensjs/master/lens.js
 *
 * History:
 *   2013-02-08 Mashed together inexpertly from Hoopla and lensjs/index.html
 *   2016-07+ Extended to include elliptical models, file IO
 */

// Enclose the Javascript
(function(exports) {
	exports.Hoopla = Hoopla;

	// 添加addEvent函数定义，用于兼容不同浏览器的事件监听
	function addEvent(element, eventName, handler) {
		if (element.addEventListener) {
			element.addEventListener(eventName, handler, false);
		} else if (element.attachEvent) {
			element.attachEvent('on' + eventName, handler);
		} else {
			element['on' + eventName] = handler;
		}
	}

	// First we will create the basic function
	function Hoopla(obj) {

		this.srcmodel = (obj && typeof obj.srcmodel === "string") ? obj.srcmodel : "hoopla-srcmodel";
		this.prediction = (obj && typeof obj.prediction === "string") ? obj.prediction : "hoopla-prediction";

		// Set some variables based on the inputs:
		this.id = (obj && typeof obj.id == "string") ? obj.id : "hoopla-model";
		this.pixscale = (obj && typeof obj.pixscale == "number") ? obj.pixscale : 0.03;

		// Set up the canvas for drawing the model image etc:
		this.paper = new Canvas({ 'id': this.id });

		this.srcmodelPaper = new Canvas({'id': this.srcmodel});
		this.freezeSrcModel = false;
		let _this = this;
		// this.srcmodelPaper.canvas.onclick = function() {
		// 	_this.freezeSrcModel = _this.freezeSrcModel ? false: true;
		// };

		this.predictionPaper = new Canvas({'id': this.prediction});

    	// Get the canvas width and height:
		this.width = this.predictionPaper.width;
		this.height = this.predictionPaper.height;

    	// Let's define some events
    	this.events = {load:"",loadimage:"",click:"",mousemove:"",mouseout:"",mouseover:"",init:""};
    	this.img = { complete: false };
    	this.showcrit = true;

		// Create an instance of a lens:
		this.lens = new Lens({ 'width': this.width, 'height': this.height, 'pixscale': this.pixscale});

		// Setup our buttons etc
		this.setup();
		// this.models = [];
		this.model = {
			name: 'Example',
			src:"",
			pixscale: this.pixscale,
			components: [
				{
					plane: "source",
					size:  0.3,
					x: 100.0,
					y: 100.0,
					ell: 0.7,
					ang: 32
				}
			]
		};

		this.init();
	}

	Hoopla.prototype.resetLens = function(width, height, pixscale) {
		this.lens.w = width;
		this.lens.h = height;
		this.lens.pixscale = pixscale;
	}

	Hoopla.prototype.loadModel = function(components) {
		console.log('loadModel');
		// 创建components数组的深拷贝，避免修改原始数组
		this.model.components = JSON.parse(JSON.stringify(components));
		console.log(this.model.components);
    	this.init();
	}

	Hoopla.prototype.updateModel = function(components) {
		console.log('updateModel');
		if (components.length === 0) {
			if (this.model.components.length === 0) {
				let source = this.model.source;
				components.splice(0, 0, source);
				this.model.components = components;
			}
		} else {
			if (components[0].plane === "source") {
				if (this.model.components[0].plane === "source") {
					this.model.components[0] = components[0];
				} else {
					this.model.components.splice(0, 0, components[0]);
				}
			} else {
				if (this.model.components[0].plane === "source") {
					let source = this.model.components[0];
					components.splice(0, 0, source);
					// components.splice(2);
					this.model.components = components;
				} else {
					let source = this.model.source;
					components.splice(0, 0, source);
					this.model.components = components;
				}
			}
		}

		this.init();
	}

	//计算数据的轮廓
	Hoopla.prototype.getContours = function(data,z){
		let c = new Conrec();

		// Check inputs
		if(typeof data!=="object") return c;
		if(typeof z!=="object") return c;
		if(data.length < 1) return c;
		if(data[0].length < 1) return c;

		let ilb = 0;
		let iub = data.length-1;
		let jlb = 0;
		let jub = data[0].length-1;
		let idx = new Array(data.length);
		let jdx = new Array(data[0].length);
		for(let i = 0 ; i < idx.length ; i++) idx[i] = i+1;
		for(let j = 0 ; j < jdx.length ; j++) jdx[j] = j+1;

		// contour(d, ilb, iub, jlb, jub, x, y, nc, z)
		// d               ! matrix of data to contour
		// ilb,iub,jlb,jub ! index bounds of data matrix
		// x               ! data matrix column coordinates
		// y               ! data matrix row coordinates
		// nc              ! number of contour levels
		// z               ! contour levels in increasing order
		c.contour(data, ilb, iub, jlb, jub, idx, jdx, z.length, z);
		return c;
	}

	// 画出透镜轮廓
	Hoopla.prototype.drawContours = function(canvas, c, opt){
		if(c.length < 1) return;

		let color = (opt && typeof opt.color==="string") ? opt.color : '#FFFFFF';
		let lw = (opt && typeof opt.lw==="number") ? opt.lw : 1;
		let i, l;
		canvas.ctx.strokeStyle = color;
		canvas.ctx.lineWidth = lw;
		for(l = 0; l < c.length ; l++){
			canvas.ctx.beginPath();
			for(i = 0; i < c[l].length ; i++) {
				canvas.ctx.arc(c[l][i].x,c[l][i].y,0.5,0.0,Math.PI*2.0,true);
			}
			canvas.ctx.closePath();
			canvas.ctx.stroke();
		}
		return this;
	}

	Hoopla.prototype.drawAll = function(lens,canvas){
		this.drawComponent("lens");
		this.drawComponent("mag");
		this.drawComponent("image");
		return this;
	}

	// Draw a specific component of the Lens object
	Hoopla.prototype.drawComponent = function(mode){

		let lens = this.lens;
		let canvas = this.paper;

		if(!mode || typeof mode!=="string") return;

		// Have we previously made this component layer?
		let previous = !!(canvas.clipboard[mode]);

		// Load in the previous version if we have it (this will save us setting the RGB)
		let imgData = (previous) ? canvas.clipboard[mode] : canvas.ctx.createImageData(lens.w, lens.h);
		let pos = 0;
		let c = [0, 0, 0];

		// The RGB colours
		if(mode === "lens") c = [60, 60, 60];
		else if(mode === "mag") c = [0, 120, 0];
		// else if(mode == "image") c = [195, 215, 255];
		// Better color for CFHTLS examples:
        else if(mode === "image") c = [115, 185, 255];

		// We just want to draw sources
		if(mode === "source"){
			canvas.ctx.fillStyle = "#FF9999";
			canvas.ctx.strokeStyle = "#ffffff";
			for(let i = 0 ; i < lens.source.length ; i++){
				// Add a circle+label to show where the source is
				let r = 5;
				canvas.ctx.beginPath();
				canvas.ctx.arc(lens.source[i].x-parseInt(r/2), lens.source[i].y-parseInt(r/2), r, 0 , 2 * Math.PI, false);
				canvas.ctx.strokeText("Source "+(i+1),lens.source[i].x+r, lens.source[i].y+r);
				canvas.ctx.fill();
				canvas.ctx.closePath();
			}
			return;
		}

		// Loop over the components
		for(let i = 0; i < lens.w*lens.h ; i++){

			// If we've not drawn this layer before we should set the RGB
			if(!previous){
				// Add to red channel
				imgData.data[pos] = c[0];

				// Add to green channel
				imgData.data[pos+1] = c[1];

				// Add to blue channel
				imgData.data[pos+2] = c[2];
			}

			// Alpha channel
			if(mode === "lens"){
				// MAGIC number 0.7 -> Math.round(255*0.7) = 179
				imgData.data[pos+3] = 179*Math.sqrt(lens.mag[i].kappa);
			}else if(mode === "mag"){
				// MAGIC number 0.01 -> Math.round(255*0.01) = 3
				imgData.data[pos+3] = 3/Math.abs(lens.mag[i].inverse);
			}else if(mode === "image"){
				// MAGIC number 0.1, trades off with blur steps... -> Math.round(255*0.2) ~ 50
				imgData.data[pos+3] = 50*lens.predictedimage[i];
				// Without blurring:
                // imgData.data[pos+3] = 165*lens.predictedimage[i];
			}else{
				imgData.data[pos+3] = 255;
			}
			pos += 4;
		}

		// Keep a copy of the image in a clipboard named <mode>
		canvas.copyToClipboard(mode,imgData);
		if(mode === "image"){
			// Blur the image? Try without!
			imgData = canvas.blur(imgData, lens.w, lens.h);
		}
		// Draw the image to the <canvas> in the DOM
		canvas.overlay(imgData);
		return this;
	}


	// Hot colormap function (imitates Python's matplotlib hot colormap)
	Hoopla.prototype.hotColormap = function(intensity) {
		// Clamp intensity to [0, 1]
		intensity = Math.max(0, Math.min(1, intensity));
		
		let r, g, b;
		
		if (intensity < 0.33) {
			// Black to red: 0.0 → 0.33
			r = intensity * 3;
			g = 0;
			b = 0;
		} else if (intensity < 0.66) {
			// Red to yellow: 0.33 → 0.66
			r = 1;
			g = (intensity - 0.33) * 3;
			b = 0;
		} else {
			// Yellow to white: 0.66 → 1.0
			r = 1;
			g = 1;
			b = (intensity - 0.66) * 3;
		}
		
		// Scale to 0-255
		return [
			Math.round(r * 255),
			Math.round(g * 255),
			Math.round(b * 255)
		];
	}

	// We need to set up.
	Hoopla.prototype.setup = function(){

		this.buttons = { crit: document.getElementById('criticalcurve') };
		let _obj = this;
		if(this.buttons.crit){
			addEvent(this.buttons.crit,"click",function(e){
				_obj.showcrit = !_obj.showcrit;
				_obj.update();
			});
		}
		addEvent(this.paper.canvas, "mousemove", function(e){
			_obj.trigger("mousemove",{x: e.layerX, y: e.layerY})
		});
		addEvent(this.paper.canvas,"mouseout",function(e){
			_obj.trigger("mouseout")
		});
		addEvent(this.paper.canvas,"mouseover",function(e){
			_obj.trigger("mouseover")
		});
		addEvent(this.paper.canvas,"click",function(e){
			_obj.freezeSrcModel = !_obj.freezeSrcModel;
			if(_obj.freezeSrcModel){
				_obj.setFreezed()
			}else{
				_obj.setActived();
			}
		});
		return this;
	}
	// 设置标签为Freezing
	Hoopla.prototype.setFreezed = function(){
		this.freezeSrcModel = true;
		let tag = document.getElementById('tag');
		tag.innerHTML = "<span class=\"tooltiptext\">Freezing Mode is unactivated, click left button of the mouse to turn into interactive mode.</span>Freezing"
		tag.style.backgroundColor = "lightblue";
	}

	Hoopla.prototype.setActived = function(){
		this.freezeSrcModel = false;
		let tag = document.getElementById('tag');
		tag.innerHTML = "<span class=\"tooltiptext\">Interactive Mode is activated, click left button of the mouse to turn into freezing mode.</span>Interactive";
		tag.style.backgroundColor = "orange";
	}

	// 初始化透镜模型
	Hoopla.prototype.init = function(inp,fnCallback){
		console.log("init");
		let _this = this;
		_this.freezeSrcModel=false;
		if(typeof this.model.src === "string") this.loadImage(this.model.src);
		if(typeof this.model.components === "object"){
			this.lens.removeAll('lens');
			this.lens.removeAll('source');

			for(let i = 0; i < this.model.components.length ; i++){
				this.lens.add(this.model.components[i]);
			}

			this.lens.calculateAlpha();
			this.lens.calculateImage();

			this.critcurve = [];
			this.caustics = [];
			//这段代码是画出Source Plane和Image Plane上面的计算后的椭圆模型轮廓
			if(typeof Conrec==="function"){
				let i, row, col;
				// Critical curve:
				let invmag = new Array(this.lens.h);
				for(row = 0 ; row < this.lens.h ; row++){
					invmag[row] = new Array(this.lens.w);
					for(col = 0 ; col < this.lens.w ; col++){
						i = row + col*this.lens.h;
						invmag[row][col] = this.lens.mag[i].inverse;
					}
				}
				let contours = this.getContours(invmag,[0.0]);
				this.critcurve = contours.contourList();

				// Caustics:
				this.caustics = new Array(this.critcurve.length);
				// Loop over separate loops of the critcurve contour, of which there are c.length:
				let c = this.critcurve;
				for(let l = 0; l < c.length ; l++){
					this.caustics[l] = new Array(this.critcurve[l].length);
					// Loop over all the points in this contour, mapping them back to the source plane:
					for(let k = 0; k < c[l].length ; k++) {
						i = this.lens.altxy2i(Math.round(c[l][k].x),Math.round(c[l][k].y));
						this.caustics[l][k] = {x: (Math.round(c[l][k].x - this.lens.alpha[i].x)), y: (Math.round(c[l][k].y - this.lens.alpha[i].y))};
					}
				}
			}
		}

		this.srcmodelPaper.clear();
		this.predictionPaper.clear();

		// 重新绘制掩码轮廓
		if (typeof drawMaskOutline === 'function') {
			drawMaskOutline();
		}

		// Take a copy of the blank <canvas>
		this.paper.copyToClipboard();

		// Reset mousemove events
		this.events['mousemove'] = "";

		// Bind the callback events
		let e = ["mousemove","mouseover","mouseout"];
		let ev = "";

		for(let i = 0; i < e.length; i++){
			this.paper.events[e[i]] = "";
			if (e[i] === "mousemove") {
				// 这里绑定的是canvas画布的事件
				this.srcmodelPaper.bind(e[i], { ev:ev, hoopla:this }, function(e) {
					_this.e = {x:e.x, y:e.y};
					if (!_this.freezeSrcModel) {
						e.data.hoopla.update(e);
					}
				});
			}
		}
		if(typeof fnCallback=="function") fnCallback(this);
		this.trigger("init");
		this.setActived();
		return this;
	}

	Hoopla.prototype.getFormat = function(date){
		var year = date.getFullYear();
		var month = ('0' + (date.getMonth() + 1)).slice(-2);
		var day = ('0' + date.getDate()).slice(-2);
		var hours = ('0' + date.getHours()).slice(-2);
		var minutes = ('0' + date.getMinutes()).slice(-2);

		return year + month + day + hours + minutes;

	}
	// 显示模型信息并提供下载选项
	Hoopla.prototype.saveModel = function(imgSrc){

		// this.model.name = imgSrc.split('/')[imgSrc.split('/').length-1].split('.')[0];
		this.model.name = img_name + "_"+ this.getFormat(new Date());
		
		this.model.pixscale = this.pixscale*window.fileHandlerScale;
		
		delete this.model.source;
		let str = JSON.stringify(this.model,
								 function(key, val) {
									 return val.toFixed ? Number(val.toFixed(4)):val;
								 }, 4);

		let link = document.createElement('a');
		link.download = this.model.name+'.JSON';
		let blob = new Blob([str], {type: 'text/plain'});
		link.href = window.URL.createObjectURL(blob);
		link.click();
	}

	Hoopla.prototype.downloadImage = function downloadImage(){
		//cavas 保存图片到本地  js 实现
		//------------------------------------------------------------------------
		//1.确定图片的类型  获取到的图片格式 data:image/Png;base64,......
		var type ='png';//你想要什么图片格式 就选什么吧
		var d=document.getElementById("hoopla-srcmodel");
		var imgdata=d.toDataURL(type);
		//2.0 将mime-type改为image/octet-stream,强制让浏览器下载
		var fixtype=function(type){
			type=type.toLocaleLowerCase().replace(/jpg/i,'jpeg');
			var r=type.match(/png|jpeg|bmp|gif/)[0];
			return 'image/'+r;
		};
		imgdata=imgdata.replace(fixtype(type),'image/octet-stream');
		//3.0 将图片保存到本地
		var savaFile=function(data,filename)
		{
			var save_link=document.createElementNS('http://www.w3.org/1999/xhtml', 'a');
			save_link.href=data;
			save_link.download=filename;
			var event=document.createEvent('MouseEvents');
			event.initMouseEvent('click',true,false,window,0,0,0,0,0,false,false,false,false,0,null);
			save_link.dispatchEvent(event);
		};
		var filename=''+new Date().getDate()+'.'+type;
		//注意咯 由于图片下载的比较少 就直接用当前几号做的图片名字
		savaFile(imgdata,filename);
		return filename;
	}
	// 更新透镜模型并重新计算图像
	Hoopla.prototype.update = function(e){
		// console.log('update');
		if (!e) { return; }
		// console.log(e);
		// Get the size of the existing source
		let src = this.lens.source[0];
		// Remove existing sources
		this.lens.removeAll('source');
		// Set the lens source to the current cursor position, transforming pixel coords to angular coords:
		// 这里直接调用lens.pix2ang()会出现问题，导致coords里面的内容全为0
		// const coords = this.lens.pix2ang({x:e.x, y:e.y});
		let coords = {x: (e.x - this.width/2)*this.pixscale , y: (this.height/2 - e.y)*this.pixscale};
		// Update the source x,y positions
		src.x = coords.x;
		src.y = coords.y;
		this.model.components[0].x = coords.x;
		this.model.components[0].y = coords.y;
		src.n = this.model.components[0].n_sersic;
		// console.log(src);

		// Add the source back
		this.lens.add(src);
		// Paste original image
		this.paper.pasteFromClipboard();
		this.predictionPaper.clear();
		// console.log(this.paper);
		if (this.showcrit) {
			this.srcmodelPaper.clear();
			let critcurve = this.downsample(this.critcurve);
			let caustics = this.downsample(this.caustics);

			this.drawContours(this.predictionPaper, critcurve, {color:'#ff9999', lw:1.1});
			this.drawContours(this.srcmodelPaper, caustics, {color:'#66ff66', lw:1.1});
		}
		// Re-calculate the lensed and true images
		this.lens.calculateImage();
		this.lens.calculateTrueImage();
		// Calculate and overlay source outline:
		if(typeof Conrec === "function"){
			let i, row, col;
			let timage = new Array(this.lens.h);
			for(row = 0 ; row < this.lens.h ; row++){
				timage[row] = new Array(this.lens.w);
				for(col = 0 ; col < this.lens.w ; col++){
					i = row + col * this.lens.h;
					timage[row][col] = this.lens.trueimage[i];
				}
			}
			let z = this.lens.source[0].Ie;
			let lasso = this.getContours(timage, [z]);
			let outline = lasso.contourList();
			outline = this.downsample(outline);
			this.drawContours(this.srcmodelPaper, outline, {color:'#66ccff', lw:1.1});
		}
		// Calculate and overlay arcs outline:
		if (typeof Conrec === "function") {
			let i, row, col;
			let pimage = new Array(this.lens.h);
			for (row = 0; row < this.lens.h; row++) {
				pimage[row] = new Array(this.lens.w);
				for (col = 0; col < this.lens.w; col++) {
					i = row + col * this.lens.h;
					pimage[row][col] = this.lens.predictedimage[i];
				}
			}
			let z = this.lens.source[0].Ie;
			let lasso = this.getContours(pimage, [z]);
			let outline = lasso.contourList();
			outline = this.downsample(outline);
			this.drawContours(this.predictionPaper, outline, {color: '#66ccff', lw: 1.1});
		}
		// 重新绘制mask轮廓
		if (typeof this.drawMaskOutline === 'function') {
			this.drawMaskOutline();
		}
	}
	// Downsample contours from a list of contours
	Hoopla.prototype.downsample = function(contourList) {
		const factor = 4;
		let downsampledList = [];

    	for (let i = 0; i < contourList.length; i += 1) {
			let contour = contourList[i];
			let downsampled = [];

			for (let j = 0; j < contour.length; j += factor) {
				downsampled.push(contour[j]);
			}
			downsampledList.push(downsampled);
    	}
		return downsampledList;
	}

	// Loads the image file. You can provide a callback or have
	Hoopla.prototype.loadImage = function(source, fnCallback){
		let src = "";
		if(typeof source==="string") src = source;
		if(typeof src=="string" && src){
			this.image = null
			let _obj = this;
			this.img = new Image();
			this.img.onload = function(){
				// 清除mask
				const maskRadiusInput = document.getElementById('maskRadius');
				if (maskRadiusInput) {
					maskRadiusInput.value = '0'; // 重置半径为0
				}
				
				// 移除所有mask轮廓元素
				const containerIds = ['marking-container', 'marking-container-src'];
				containerIds.forEach(id => {
					const container = document.getElementById(id);
					if (container) {
						const oldMask = container.querySelector('.mask-outline');
						if (oldMask) {
							container.removeChild(oldMask);
						}
					}
				});
				
				// 确保maskRadius值为0后，调用applyMask来更新掩码状态
				if (typeof _obj.applyMask === 'function') {
					_obj.applyMask();
				}
				
				_obj.update();
				// Call any callback functions
				if(typeof fnCallback=="function") fnCallback(_obj);
				_obj.trigger("loadimage");
			}
			this.img.src = src;
		}

		return this;
	}

	// Attach a handler to an event for the Canvas object in a style similar to that used by jQuery
	Hoopla.prototype.bind = function(ev,e,fn){
		if(typeof ev!="string") return this;
		if(typeof fn==="undefined"){
			fn = e;
			e = {};
		}else{
			e = {data:e}
		}
		if(typeof e!="object" || typeof fn!="function") return this;
		if(this.events[ev]) this.events[ev].push({e:e,fn:fn});
		else this.events[ev] = [{e:e,fn:fn}];
		return this;
	}
	// Trigger a defined event with arguments. This is for internal-use to be
	// sure to include the correct arguments for a particular event
	Hoopla.prototype.trigger = function(ev,args){
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
			if(!oElement) { console.log(oElement); return; }
			if(oElement.addEventListener) oElement.addEventListener(strEvent, fncHandler, false);
			else if(oElement.attachEvent) oElement.attachEvent("on" + strEvent, fncHandler);
		}
	}

	// Extra mathematical/helper functions that will be useful - inspired by http://alexyoung.github.com/ico/
	let G = {};
	G.sum = function(a) {
		let i, sum;
		for (i = 0, sum = 0; i < a.length; sum += a[i++]) {}
		return sum;
	};

	if (typeof Array.prototype.max === 'undefined')
		G.max = function(a) {
			return Math.max.apply({}, a);
		};
	else
		G.max = function(a) {
			return a.max();
		};
	if (typeof Array.prototype.min === 'undefined')
		G.min = function(a) {
			return Math.min.apply({}, a);
		};
	else
		G.min = function(a) {
			return a.min();
		};

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
				if (source.hasOwnProperty(property))
					destination[property] = source[property];
			}
			return destination;
		};
	} else G.extend = Object.extend;

	// 绘制掩码轮廓
	Hoopla.prototype.drawMaskOutline = function() {
		// 获取半径值
		let radius = parseInt(document.getElementById('maskRadius').value)||0 ;

		// 为Canvas元素创建独立的掩码div元素
		const canvasIds = ['hoopla-srcmodel', 'hoopla-prediction'];
		canvasIds.forEach(id => {
			const canvas = document.getElementById(id);
			if(radius>canvas.width/2){
				radius = canvas.width/2;
			}
			if (canvas && canvas.tagName === 'CANVAS') {
				// 获取Canvas的父容器
				const parent = canvas.parentElement;
				if (parent) {
					// 移除之前的掩码
					const oldMask = parent.querySelector('.canvas-mask-outline');
					if (oldMask) {
						parent.removeChild(oldMask);
					}
					// 创建新的掩码div
					const maskOutline = document.createElement('div');
					maskOutline.className = 'canvas-mask-outline';
					maskOutline.style.position = 'absolute';
					maskOutline.style.top = canvas.offsetTop + 'px';
					maskOutline.style.left = canvas.offsetLeft + 'px';
					maskOutline.style.width = canvas.width + 'px';
					maskOutline.style.height = canvas.height + 'px';
					maskOutline.style.pointerEvents = 'none';
					maskOutline.style.zIndex = '1'; // 降低z-index，确保椭圆显示在掩码之上

					// 创建圆形边框
					const circle = document.createElement('div');
					circle.style.position = 'absolute';
					circle.style.top = '50%';
					circle.style.left = '50%';
					circle.style.transform = 'translate(-50%, -50%)';
					circle.style.width = (radius * 2) + 'px';
					circle.style.height = (radius * 2) + 'px';
					circle.style.border = '2px solid white';
					circle.style.borderRadius = '50%';
					circle.style.boxSizing = 'border-box';

					maskOutline.appendChild(circle);
					parent.appendChild(maskOutline);
				}
			}
		});

		// 对于标记容器，我们可以绘制一个简单的div作为掩码轮廓
		const containerIds = ['marking-container', 'marking-container-src'];
		containerIds.forEach(id => {
			const container = document.getElementById(id);
			if(radius>container.width/2){
				radius = container.width/2;
			}

			if (container) {
				// 移除之前的掩码轮廓
				const oldMask = container.querySelector('.mask-outline');
				if (oldMask) {
					container.removeChild(oldMask);
				}
					
				// 创建掩码轮廓div
				const maskOutline = document.createElement('div');
				maskOutline.className = 'mask-outline'; // 添加类名，便于后续移除
				maskOutline.style.position = 'absolute';
				maskOutline.style.top = '50%';
				maskOutline.style.left = '50%';
				maskOutline.style.transform = 'translate(-50%, -50%)';
				maskOutline.style.width = (radius * 2) + 'px';
				maskOutline.style.height = (radius * 2) + 'px';
				maskOutline.style.border = '2px solid white';
				maskOutline.style.borderRadius = '50%';
				maskOutline.style.boxSizing = 'border-box';
				maskOutline.style.pointerEvents = 'none'; // 确保掩码不会干扰交互
				maskOutline.style.zIndex = '0'; // 进一步降低z-index，确保椭圆显示在掩码之上
				
				container.appendChild(maskOutline);
			}
		});
	};

	Hoopla.prototype.clearMask = function() {
		// 清除掩码轮廓
		const containerIds = ['marking-container', 'marking-container-src'];
		containerIds.forEach(id => {
			const container = document.getElementById(id);
			if (container) {
				// 移除之前的掩码轮廓
				const oldMask = container.querySelector('.mask-outline');
				if (oldMask) {
					container.removeChild(oldMask);
				}
			}
		});
		document.getElementById('maskRadius').value = undefined;
	}
		

})(typeof exports !== "undefined" ? exports : window);
