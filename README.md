# 面试准备站点（GPU 驱动 / 内核方向）

面向 **GPU / AI 基础设施、Linux 内核与驱动** 方向资深社招（5 年+）的知识体系 + 分类题库。
依据 NVIDIA / AMD / Qualcomm 岗位 JD 反向整理，**不覆盖算子开发**。

## 怎么打开

### 方式一：直接双击（推荐，离线可用）

把整个目录拷到任意位置，双击 `index.html`，浏览器以 `file://` 打开即可。

阅读、刷题、即时判分、答案解析、错题本、答题卡跳转、主题切换、侧边目录全部正常。
不依赖任何服务器、CDN、网络或构建工具。

> 题目数据打包在 `quiz/data/bundle.js` 里，通过 `<script src>` 加载，
> 不经过 `fetch`，因此不会被 `file://` 的同源策略挡住。

### 方式二：本地 HTTP 服务

```bash
cd interview-prep
python3 -m http.server 8080
```

浏览器访问 <http://localhost:8080/>。

## 目录结构

```
interview-prep/
├── index.html              首页
├── pages/                  知识阅读页（7 个专题 + 岗位路线）
│   ├── roadmap.html        岗位 JD 拆解与备考路线
│   ├── kernel.html         Linux 内核与驱动
│   ├── gpu.html            GPU 软件栈与 CUDA
│   ├── virt.html           虚拟化与隔离
│   ├── net.html            计算机网络
│   ├── cpp.html            C / C++
│   ├── python.html         Python
│   └── sysdebug.html       调试与性能分析
├── quiz/
│   ├── index.html          刷题页
│   ├── quiz.js             刷题引擎（纯前端，无依赖）
│   └── data/
│       ├── index.json      分类元数据
│       ├── *.json          各分类题库（唯一数据源，可编辑）
│       └── bundle.js       构建产物，勿手改
├── assets/
│   ├── style.css           全站样式
│   └── app.js              导航 / 目录 / 主题 / 进度条
└── build-bundle.py         题库打包脚本
```

## 改题库之后必须重新打包

`*.json` 是唯一可编辑的数据源；`bundle.js` 是它生成的产物。
**改了任何题库 JSON 都要重跑一次，否则刷题页读到的还是旧数据：**

```bash
python3 build-bundle.py
# wrote quiz/data/bundle.js  (7 分类 / 96 题 / 65.9 KB)
```

脚本会校验每个分类的实际题数与 `index.json` 里声明的 `count` 是否一致，不一致会告警。

## 题库格式

```json
{
  "questions": [
    {
      "id": "k-001",
      "q": "题干，支持 `行内代码`",
      "opts": ["选项 A", "选项 B", "选项 C", "选项 D"],
      "a": 1,
      "exp": "解析。要讲清楚为什么对、其他项错在哪。",
      "level": "高频",
      "tags": ["进程", "调度"]
    }
  ]
}
```

- `a`：正确选项下标，**从 0 开始**。
- `level`：只能是 `高频` / `中频` / `低频`，用于面试优先级。
- 分类 `key` 固定为 `kernel|gpu|virt|net|cpp|python|sysdebug`，改名会打断错题本记账。

## 数据保存

错题与进度存在浏览器 `localStorage`：

- `ip-wrong` —— 错题列表，形如 `["kernel:k-003", ...]`
- `ip-done` —— 已答题，形如 `{"kernel:k-003": 1}`
- `ip-theme` —— 主题偏好

换浏览器或清缓存会丢失。部分浏览器在 `file://` 下会禁用 `localStorage`，
此时刷题本身不受影响，只是错题本无法跨会话保存 —— 用上面的 HTTP 方式打开即可。

## 内容边界

- **不含算子开发**（kernel writing / 算子优化），只讲「以软件驾驭硬件」的部分。
- 岗位要求中，NVIDIA 部分引自官方 Workday 招聘系统的真实 JD 原文；
  AMD / Qualcomm 官方接口当时不可达，相关要求已明确标注为业界通用口径，**不是原文**。
- 具体到某家公司某一轮面试，题目会随团队差异很大。这份材料的价值是覆盖面与系统深度，不押题。
