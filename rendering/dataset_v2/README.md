# 蓝色枪头／红色托盘数据与微调 v2

本版本使用2026-11-09确认的配色，2,000个独立随机场景、每场景2张，共4,000张1280×960原始RGB图。按scene_id分为3,200张训练、400张验证、400张测试。使用与v1不同的随机种子，保留v1目录及权重。

## 场景与标签

- 枪头及口沿基色为`#1684cf`，枪头基础alpha在0.28–0.58随机变化，保留角度相关alpha项；外壳alpha为0.20–0.52。
- 托盘在红色附近随机变化色调、饱和度、明度；光照、曝光、盒体位置和旋转、枪口间距及相机方位随机化。
- 约50%场景抽取70–96支枪头，其余8–69支，额外保证目标边缘孔位占用。约60%视角从更接近水平的高度范围抽取；实际低于5°的比例另行统计。
- 类别0为枪头口沿，类别1为助吸器枪口端面。每个检测框仅覆盖口部，一个关键点对应物理中心的投影。
- 沿用不透明实例ID代理的16点口沿可见性判断：至少25%才监督关键点。此判断不等同于透明塑料的真实光学可见性。

## 生成与校验

在仓库根目录启动HTTP服务器后，使用安装了Playwright和Pillow的Python：

```sh
export DATASET_OUTPUT=/absolute/path/to/new-v2-data
export RENDER_URL=http://127.0.0.1:8792/rendering/engine/
python rendering/dataset_v2/generate.py
python rendering/dataset_v2/package_dataset.py
```

可设置`CHROME_PATH`。默认SCENE_COUNT=2000；小规模试跑使用全新目录，完整打包要求4,000张。生成器分组阈值固定，扩展规模时需显式重新规划拆分。

打包脚本校验数量、图像可解码、标签范围、场景互斥、图片哈希唯一性，并保存manifest和带GT点的检查预览。训练输入不带标注点或文字。更改规则后不要续写旧目录。

## 微调与比较

服务器独立目录：`/root/autodl-tmp/synthetic_keypoints_blue_red_v2`。环境沿用现有Ultralytics 8.4.183、torch 2.8.0+cu128。把v1的1,600图训练模型复制为`base_model.pt`。

1. 原v1模型在v2测试集上推理，保存`evaluation_before`。
2. 从`base_model.pt`微调YOLO26n-pose：30轮上限，patience=8，输入960，batch24，AdamW，初始学习率0.0003。只使用v2训练/验证集，最佳权重依据验证集选择。
3. 最佳微调模型在同一v2测试集上评估，保存`evaluation_after`。
4. 最佳微调模型在原v1的200张测试图上评估，保存`evaluation_old`，检查旧配色退化。

`pipeline.sh`执行以上步骤；脚本中的服务器路径需按部署位置修改。评估脚本通过`EVAL_DATA`、`EVAL_WEIGHTS`、`EVAL_OUTPUT`环境变量指定数据、模型、结果目录。

主要指标是包含漏检的配对成功率、配对覆盖率，以及成功配对时的Δu/Δv误差。Δ=枪口中心−枪头中心，u向右、v向下，误差均按原图1280×960计算。类别一致的GT框匹配仅用于离线评分，不是实际A01–H12孔位识别。合成测试成绩不代表实拍精度，也不能保证遮挡对象可识别。

## 单张图片推理

`predict_delta.py` 不使用GT，输出识别到的每个枪头口沿与枪口的Δu/Δv及标记图：

```sh
python predict_delta.py --weights best.pt --image image.jpg --output prediction --device 0
```

未检测到枪口或存在多个枪口候选时，返回明确状态并不输出配对。输出中的prediction_index仅是本帧预测编号，不是孔位行列编号。
