#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 quiz/data/*.json 打包成 quiz/data/bundle.js。

为什么要打包：浏览器在 file:// 协议下会把 origin 视为 null，
fetch('data/index.json') 会被同源策略拦掉，但 <script src> 不受限制。
所以离线使用时改为用 <script> 注入数据。

改了任何题库 JSON 之后重跑一次：
    python3 build-bundle.py
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, 'quiz', 'data')


def main():
    with open(os.path.join(DATA, 'index.json'), encoding='utf-8') as f:
        index = json.load(f)

    questions = {}
    total = 0
    for cat in index['categories']:
        path = os.path.join(DATA, cat['file'])
        with open(path, encoding='utf-8') as f:
            qs = json.load(f)['questions']
        if len(qs) != cat['count']:
            print('warning: %s 声明 %d 题，实际 %d 题'
                  % (cat['key'], cat['count'], len(qs)), file=sys.stderr)
        questions[cat['key']] = qs
        total += len(qs)

    payload = {'categories': index['categories'], 'questions': questions}
    out = os.path.join(DATA, 'bundle.js')
    with open(out, 'w', encoding='utf-8') as f:
        f.write('/* 自动生成，请勿手改。改完题库后执行 python3 build-bundle.py */\n')
        f.write('window.__QUIZ_DATA__=')
        json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')

    print('wrote %s  (%d 分类 / %d 题 / %.1f KB)'
          % (os.path.relpath(out, ROOT), len(index['categories']), total,
             os.path.getsize(out) / 1024.0))


if __name__ == '__main__':
    main()
