//----------------------------------------------------------------------------
/*
 * Javascript Gravitational Lensing Library
 * 2013 Stuart Lowe (http://lcogt.net/), Phil Marshall (University of Oxford)
 * 2016 Nan Li (Argonne National Lab, http:linan7788626.github.io)
 *
 * Licensed under the MPL http://www.mozilla.org/MPL/MPL-1.1.txt
 *
 */
//----------------------------------------------------------------------------
// Enclose the Javascript
(function(exports) {
	exports.Lens = Lens;

	function Lens(input){
		// INPUTS:
		//    width       calculation (canvas) grid width in pixels
		//    height      calculation (canvas) grid height in pixels
		//    pixscale    pixel scale arcsec per pixel: this is used to
		//                convert angular coordinates and distances to pixels
		// Set some defaults in case of no input...
		this.w = 0;
		this.h = 0;
		this.pixscale = 1.0;
		// An array of lens components:
		this.lens = [];
		// An array of source components:
		this.source = [];
		// Some working arrays:
		this.predictedimage = [];
		this.trueimage = [];
		this.alpha = []

		//检查输入完整性
		// Sanity check the input. We must get a width, a height and a pixscale (arcseconds/pixel)
		if(!input) return this;
		if(input.width && typeof input.width!=="number") return this;
		if(input.height && typeof input.height!=="number") return this;
		if(input.pixscale && typeof input.pixscale!=="number") return this;

		// Process any input parameters 处理输入参数
		this.w = input.width;
		this.h = input.height;
		this.pixscale = input.pixscale;
		// Create 1D arrays   生成一维数组
		// 1) array to hold the predicted and true image 数组保存预测和真实图像
		this.predictedimage = new Array(this.w*this.h);
		this.trueimage = new Array(this.w*this.h);
		// 2) arrays to hold vector alpha at each (x,y)
		// alpha表示透镜的偏转角度，也称为偏转向量。它是一个包含x和y分量的向量，表示光线从其原始方向偏转的量。
		this.alpha = new Array(this.w*this.h);
		// 3) arrays to hold tensor magnification (kappa, gamma etc) at each (x,y)
		// mag表示透镜的放大倍数和形变参数
		this.mag = new Array(this.w*this.h);

		return this; // Return the Lens, ready to be manipulated.
	}
	//----------------------------------------------------------------------------
	// Add a component to the model - either lens mass or source brightness
	// 在模型中添加一个组件——透镜质量或光源亮度
	Lens.prototype.add = function(component){
		// console.log('add component');
		// Input is an object containing:
		//   plane - e.g. 'lens' or 'source'
		//   x and y positions (arcsec relative to centre of grid)
		//   lenses only: theta_e (SIS model, in arcsec)
		//   sources only: size (Gaussian sigma, in arcsec)

		// Check inputs... coordinates/distances are in arcseconds
		if(!component) return this;
		if(!component.plane || typeof component.plane!=="string") return this;
		if(component.plane !== "lens" && component.plane !== "source") return this;
		if(component.plane === "lens"){
			if(typeof component.x!=="number" || typeof component.y!=="number" || typeof component.theta_e!=="number"|| typeof component.ell!=="number"|| typeof component.ang!=="number") return this;
		}else if (component.plane === "source"){
			if(typeof component.x!=="number" || typeof component.y!=="number" || typeof component.size!=="number") return this;
		}

		// Transform angular coordinates and distances to pixel coordinate system:
		let coords = this.ang2pix({x:component.x, y:component.y});

		// Construct a new version of the component otherwise the original gets changed
		//var c = { x : coords.x, y: coords.y, theta_e: component.theta_e, plane : component.plane };
		let c = {
			x : coords.x,
			y: coords.y,
			plane : component.plane
		};

		if(c.plane === "lens"){
			c.theta_e = component.theta_e;
			c.theta_e_px = c.theta_e / this.pixscale;
			c.ell = component.ell;
			c.ang = component.ang;
			this.lens.push(c);
		}

		if(c.plane === "source"){
			c.size = component.size;
			c.size_px = c.size / this.pixscale;
			c.ell = component.ell;
			c.ang = component.ang;
			c.n = component.n_sersic || 1.0; //如果sersic指数是undefined，设置为1
			c.Ie = component.Ie || 1.0; //如果Ie是undefined，设置为1
			this.source.push(c);
		}

		return this; // Allow this function to be chainable
	}


	// From an x,y position in pixel coords,
    // get the equivalent index in the 1D array
	Lens.prototype.xy2i = function(x,y){
		let i = y + x*this.h;
		if(i >= this.w*this.h) i = this.w*this.h-1;
		return i;
	}
	Lens.prototype.altxy2i = function(x,y){
		let i = x + y*this.w;
		if(i >= this.h*this.w) i = this.h*this.w-1;
		return i;
	}
	//----------------------------------------------------------------------------
	// Coordinate transformations - note that canvas y runs from top to bottom!
	Lens.prototype.pix2ang = function(pix){
		// Check inputs
		if(!pix || typeof pix.x!=="number" || typeof pix.y!=="number") return { x: 0, y: 0 };
		return { x: (pix.x - this.w/2)*this.pixscale , y: (this.h/2 - pix.y)*this.pixscale };
	}
	Lens.prototype.ang2pix = function(ang){
		// Check inputs
		if(!ang || typeof ang.x!=="number" || typeof ang.y!=="number") return { x: 0, y: 0 };
		return { x: (ang.x / this.pixscale + this.w/2), y: (this.h/2 - ang.y / this.pixscale) }
	}
	//----------------------------------------------------------------------------
	// Cleaning up (typically before replotting)
	// 清除平面的内容
	Lens.prototype.removeAll = function(plane){
		if(!plane) return this;
		if(typeof plane !== "string") return this;
		if(plane === "source") this.source = [];
		if(plane === "lens") this.lens = [];
		return this;
	}

	// This function will populate this.alpha and this.mag, and compute critical curves and caustics:
	// 计算矢量 alpha 和张量放大率
	Lens.prototype.calculateAlpha = function(){
		// Set arrays to zero initially:
		for(let i = 0 ; i < this.w*this.h ; i++){
			this.alpha[i] = { x: 0.0, y: 0.0 };
			this.mag[i] = {kappa: 0.0, gamma1: 0.0, gamma2: 0.0, inverse: 0.0}
		}
		// Declare outside the for loop for efficiency
		let x, y;
		let tr, cs, sn;
		let rc = 0.0;
		let ql;
		// Loop over pixels:
		for(let i = 0 ; i < this.w*this.h ; i++){
			// Loop over lens components:
			for(let j = 0 ; j < this.lens.length ; j++){

				if(this.lens[j].ell <1.0){
					ql = this.lens[j].ell;
					tr = Math.PI * ((-this.lens[j].ang + 90) / 180);
				}else{
					ql = 1.0/this.lens[j].ell-0.0000000001;
					tr = Math.PI * (-this.lens[j].ang / 180);
				}

				cs = Math.cos(tr);
				sn = Math.sin(tr);

				x = i % this.w - this.lens[j].x;
				y = Math.floor(i/this.w) - this.lens[j].y;

				sx_r = x * cs + y * sn;
				sy_r = -x * sn + y * cs;

				psi = Math.sqrt(ql*ql*(rc*rc+sx_r*sx_r)+sy_r*sy_r);

				sq = Math.sqrt(1.0-ql*ql);
				pd1 = psi + rc;
				pd2 = psi + rc*ql*ql;
				fx1 = sq * sx_r / pd1;
				fx2 = sq * sy_r / pd2;
				qs = Math.sqrt(ql);

				a1 = qs / sq * Math.atan(fx1);
				a2 = qs / sq * Math.atanh(fx2);

				dx = (a1 * cs - a2 * sn);
				dy = (a2 * cs + a1 * sn);

				xt11 = cs;
				xt22 = cs;
				xt12 = sn;
				xt21 = -sn;

				fx11 = xt11 / pd1 - sx_r * (sx_r * ql * ql * xt11 + sy_r * xt21) / (psi * pd1 * pd1);
				fx22 = xt22 / pd2 - sy_r * (sx_r * ql * ql * xt12 + sy_r * xt22) / (psi * pd2 * pd2);
				fx12 = xt12 / pd1 - sx_r * (sx_r * ql * ql * xt12 + sy_r * xt22) / (psi * pd1 * pd1);
				fx21 = xt21 / pd2 - sy_r * (sx_r * ql * ql * xt11 + sy_r * xt21) / (psi * pd2 * pd2);

				a11 = qs / (1.0 + fx1 * fx1) * fx11;
				a22 = qs / (1.0 - fx2 * fx2) * fx22;
				a12 = qs / (1.0 + fx1 * fx1) * fx12;
				a21 = qs / (1.0 - fx2 * fx2) * fx21;

				rea11 = (a11 * cs - a21 * sn);
				rea22 = (a22 * cs + a12 * sn);
				rea12 = (a12 * cs - a22 * sn);
				rea21 = (a21 * cs + a11 * sn);

				/* 	kappa、gamma1和gamma2是描述透镜产生的光学畸变的参数
					kappa代表透镜的收缩率，也称为弯曲率,它描述了透镜产生的引力效应导致光线的聚焦或发散程度。
					gamma1和gamma2是剪切参数，描述了透镜产生的光线的剪切变形。它们表示光线的形变程度和方向。
				*/
				kappa = 0.5 * this.lens[j].theta_e_px * (rea11+rea22);
				gamma1 = 0.5 * this.lens[j].theta_e_px * (rea11-rea22);
				gamma2 = 0.5 * this.lens[j].theta_e_px * (rea12+rea21);

				// Add lensing effects of just this component:
				this.alpha[i].x += this.lens[j].theta_e_px*dx;
				this.alpha[i].y += this.lens[j].theta_e_px*dy;
				this.mag[i].kappa += kappa;
				this.mag[i].gamma1 += gamma1;
				this.mag[i].gamma2 += gamma2;
			}
			// Inverse magnification at this pixel:
			this.mag[i].inverse = (1.0-this.mag[i].kappa)*(1.0-this.mag[i].kappa) - this.mag[i].gamma1*this.mag[i].gamma1 - this.mag[i].gamma2*this.mag[i].gamma2
		}
		return this;
	}

	// This function will populate this.predictedimage
	Lens.prototype.calculateImage = function(){
		// Define some variables outside the loop
		// as declaring them is expensive
		let d = { x: 0, y: 0 };
		let i = 0;
		// let r2 = 0;
		const Ie = this.source[0].Ie;
		const n = this.source[0].n;
		let b_n = 1.9992 * n - 0.3271;
		const Re = this.source[0].size_px;
		// Since for a Gaussian, half light radius (size) = sigma * sqrt(2*ln(2))
		//var factor = 1.0/(0.693*this.source[0].size_px*this.source[0].size_px)
		// let sig2 = this.source[0].size_px*this.source[0].size_px*0.693
		let row, col, v;
		for(row = 0 ; row < this.h ; row++){
			for(col = 0 ; col < this.w ; col++){
				v = 0;
				d.x = col - this.source[0].x - this.alpha[i].x;
				d.y = row - this.source[0].y - this.alpha[i].y;
				phirad = -this.source[0].ang / 180 * Math.PI;
				xnew = d.x * Math.cos(phirad) + d.y * Math.sin(phirad)
				ynew = d.y * Math.cos(phirad) - d.x * Math.sin(phirad)
				// Gaussian方法
				// r2 = (xnew * xnew / this.source[0].ell + ynew * ynew * this.source[0].ell);
				// v += Math.exp(-r2 / (2.0 * sig2));
				// sersic模型
				let r_ell = Math.sqrt((xnew * xnew) / this.source[0].ell + (ynew * ynew) * this.source[0].ell);
				let rnorm = r_ell / Re;
				v += Ie * Math.exp(-b_n * (rnorm ** (1/n) - 1));
				this.predictedimage[i++] = v;
			}
		}
		return this; // Allow this function to be chainable
	}

	// This function will populate this.trueimage
	Lens.prototype.calculateTrueImage = function(){
		// console.log('calculateTrueImage');
		// Define some variables outside the loop
		// as declaring them is expensive
		let d = { x: 0, y: 0 };
		let i = 0;
		// let r2 = 0;
		const Ie = this.source[0].Ie;
		const n = this.source[0].n;
		let b_n = 1.9992 * n - 0.3271;
		const Re = this.source[0].size_px;
		// let sig2 = this.source[0].size_px*this.source[0].size_px*0.693
		//var factor = 1.0/(this.source[0].size_px*this.source[0].size_px)
		// Since for a Gaussian, half light radius (size) = sigma * sqrt(2*ln(2))
		let row, col, v;
		// Loop over x and y. Store 1-D pixel index as i.
		for(row = 0 ; row < this.h ; row++){
			for(col = 0 ; col < this.w ; col++){
				v = 0;
				d.x = col - this.source[0].x;
				d.y = row - this.source[0].y;
				phirad = -this.source[0].ang / 180 * Math.PI;
				xnew = d.x * Math.cos(phirad) + d.y * Math.sin(phirad)
				ynew = d.y * Math.cos(phirad) - d.x * Math.sin(phirad)
				// gaussian方法
				// r2 = (xnew * xnew / this.source[0].ell + ynew * ynew * this.source[0].ell);
				// v += Math.exp(-r2 / (2.0 * sig2));
				// sersic模型
				let r_ell = Math.sqrt((xnew * xnew) / this.source[0].ell + (ynew * ynew) * this.source[0].ell);
				let rnorm = r_ell / Re;
				v += Ie * Math.exp(-b_n * (rnorm ** (1/n) - 1));
				this.trueimage[i++] = v;
			}
		}
		return this; // Allow this function to be chainable
	}
})(typeof exports !== "undefined" ? exports : window);
