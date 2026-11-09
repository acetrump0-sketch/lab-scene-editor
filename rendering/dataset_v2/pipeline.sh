#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
PY=/root/autodl-tmp/yolo26_labware/venv/bin/python
export EVAL_DATA="$PWD"
export EVAL_WEIGHTS="$PWD/base_model.pt"
export EVAL_OUTPUT="$PWD/evaluation_before"
"$PY" -u evaluate_pose.py > evaluation_before.log 2>&1
"$PY" -u train_pose.py > train.log 2>&1
export EVAL_WEIGHTS="$PWD/runs/pose_v2/weights/best.pt"
export EVAL_OUTPUT="$PWD/evaluation_after"
"$PY" -u evaluate_pose.py > evaluation_after.log 2>&1
"$PY" -u analyze_failure_groups.py > failure_groups.log 2>&1
export EVAL_DATA=/root/autodl-tmp/synthetic_keypoints_20261109
export EVAL_OUTPUT="$PWD/evaluation_old"
"$PY" -u evaluate_pose.py > evaluation_old.log 2>&1
echo PIPELINE_COMPLETE
