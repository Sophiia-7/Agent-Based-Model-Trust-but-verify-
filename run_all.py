"""Полный воспроизводимый запуск: эксперименты -> рисунки -> рисунок сети.
Запуск:  python3 run_all.py [R]    (по умолчанию R = 200)"""
import subprocess
import sys

R = sys.argv[1] if len(sys.argv) > 1 else "200"
for cmd in (["experiments.py", R], ["figures.py"], ["network_viz.py"]):
    print(f"\n>>> python3 {' '.join(cmd)}")
    subprocess.run([sys.executable, *cmd], check=True)
