# 验证记录

2026-11-06：在独立仓库副本上运行render.py和annotate.py，使用macOS本机Chrome、Playwright 1.60.0。得到8张3840×2880原图和8张标注图；对象变换前后完全一致；23支枪头；最近枪头H11；三维中心距离15.000000 mm，水平偏差0。相机与measurement JSON分别8份，8×12占用矩阵总数23。中文字体为系统PingFang。

已检查标注示例。跨平台安装方式已参数化，但尚未在Linux/Windows和Playwright自带Chromium上实测。
