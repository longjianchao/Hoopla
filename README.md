Hoopla
======

`Hoopla` is a simple javascript app for modeling images of strong gravitational lenses. It allows you to hand-craft a model lens out of elliptically-symmetric mass distributions (representing massive foreground galaxies) and elliptically symmetric light sources (representing faint background galaxies), and then dynamically predict the shape of the resulting gravitationally lensed image features as you tune the model. You can provide your own image to model, and you can save your tuned model's parameters to a shareable JSON file.

<!-- Insert screenshot here! -->

**[Give Hoopla a Try!](http://linan7788626.github.io/pages/Hoopla/index.html)**

[![](https://github.com/drphilmarshall/Hoopla/blob/master/images/screenshot.png)](http://linan7788626.github.io/pages/Hoopla/index.html)

[Model parameters for this example](https://raw.githubusercontent.com/linan7788626/Hoopla/master/models/screenshot.JSON)

----

### Credits, License, Contact etc

`Hoopla` is based on the["LensWrangler"](http://drphilmarshall.github.com/LensWrangler/) prototype made by Stuart Lowe, Amit Kapadia, Aprajita Verma and Phil Marshall, but with many interesting modifications added by Nan Li. The main function library is "eelens.js" in this repository, which is an updated version of [lens.js](https://github.com/slowe/lensjs). It includes elliptical models of both lenses and sources.

`Hoopla` is open source code, free for you to re-use under the MIT License in this repository (which means you can do anything you like with it but you can't blame us if it doesn't work). If you are interested in this project, please get in touch by [writing us an issue]() - we'd love to hear from you! `Hoopla` is scientific software, and research in progress: if you make use of any of the code or ideas in this repo in your own research, please cite us as _"Li et al, in preparation"_ and provide a link to [this repo's URL](https://github.com/linan7788626/Hoopla). 

### Instructions

####基本流程
1. 将鼠标放在Mass Model和Source Model画布上，可以点击鼠标并进行拖动画出一个椭圆，这即是前景天体（星系）和透镜天体（星系）; 需要注意的是，Mass Model的椭圆需要与背景图的爱因斯坦环对应，而Source Model的椭圆位置可以随意摆放。
2. 绘制好质量模型和源模型后，在Source Plane上移动鼠标会在Image Plane上看到蓝色的圆圈，在Source Plane上移动光标可以发现Image Plane的蓝色圆圈在随之变化。
3. 你要做的是通过Source Plane上移动鼠标，找到Image Plane中圆圈与透镜图像最相似的点。如果你觉得找到了那个适配度最好的点，在Source Plane上点击鼠标左键，即可冻结Source Plane，此后再移动鼠标时，Image Plane的蓝色圆圈将不会改变。
4. 一般来说手动调节的模型总是不尽人意，此时可以点击下分的蓝色按钮Optimization，点击按钮后程序会帮助你找到效果更好的模型。在你点击Optimization按钮后，Residual Map和Chi-Square Curve会动态变化，Residual Map是显示模型与透镜天体的残差，而Chi-Square是每次进行最优化运算时的的卡方值，通过这两个图像可以看到动态建模的情况。
5. 最优模型完成后，可以点击“Save Models”将你得到的模型保存，文件保存形式是JSON格式。

####其他玩法
* 你保存了模型后，可以通过点击 “Load Models” 选择文件再次将之前的模型呈现出来，同时，还可以对之前的模型进行二次或多次调整和优化。
* 你可以点击“Upload Images”按钮，在计算机本地选择一张图片进行建模，流程如上。需要注意的是，选择图片后，建模所需的所有信息必须正确填入，这样才能保证建模过程的顺利进行。
* 在页面下方还可以改变pixel scale，输入图片对应的pixel scale后点击reset按钮即可改变图片的pixel scale。
