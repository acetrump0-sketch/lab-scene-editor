# 虚拟环境运行说明

本仓库只保留浏览器虚拟环境、Three.js运行依赖、三维资产、材质与场景配置。数据集、模型权重、训练与评估代码、HTML实验报告均在本地维护，不上传此仓库。

在仓库根目录运行：

```sh
python3 -m http.server 8000
```

访问 http://localhost:8000/rendering/engine/ 打开当前配色的场景编辑器；根目录页面保留原编辑器入口。使用页面的“加载场景”功能加载 `rendering/scenes/horizontal.json`，可恢复已确认的固定排列。

当前材质为半透明蓝色枪头、红色托盘和透明外壳；无盒盖，保留枪头口沿细纹。配色参考及参数见 [COLOR_REFERENCE.md](rendering/COLOR_REFERENCE.md)。场景中保留23支枪头，枪口端面与H11口沿中心轴向间距15 mm。调整相机不会改变器材位置。

坐标单位为米，右手坐标系，Y轴向上。孔位按A–H行、1–12列命名。枪口参考点是蓝色枪口端面中心，不是手柄或整机包围盒。

材质使用实时渲染近似，不代表实测光学参数。保存场景包含配色名称；当前默认 `blue-tips-red-tray`，原配色为 `clear-tips-blue-tray`。更换模型时须重新确认单位、朝向和枪口参考点。

原编辑器操作说明见 [editor-instruction.md](editor-instruction.md)。
