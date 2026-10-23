# 意群切分（Chunking）的认知语言学、二语习得与教学法理论基础

> **文档定位**：本文档为 Chunkly 项目的学术理论基石与工程设计指导报告。旨在系统梳理认知心理学、心理语言学、二语习得（Second Language Acquisition, SLA）与英语语音教学中关于「意群（Chunk / Thought Group）」的核心理论、实验发现与实证教学模型，阐明「视觉意群切分」如何重塑学习者的眼-脑-口-耳协同机制，并为 Chunkly 的分词算法、LLM Prompt 工程及未来多模态听读扩展（TTS / Shadowing / Karaoke）提供严密的语言学与声学规范。

---

## 目录 (Table of Contents)

1. [核心概念与理论源流 (Theoretical Foundations & Literature Lineage)](#1-核心概念与理论源流)
   - 1.1 工作记忆与容量瓶颈：从 Miller (1956) 到 Cowan (2001)
   - 1.2 Baddeley 工作记忆模型与语音回路（Phonological Loop）的默读瓶颈
   - 1.3 词块教学法、预制语块与使用驱动习得：Sinclair、Lewis、Wray 与 Ellis
   - 1.4 韵律金字塔与思想意群：Gilbert (Clear Speech) 的韵律教学论
   - 1.5 阅读流利度模型与意群线索文本：Rasinski 的实证教学法
   - 1.6 眼动加工心理机制与眼音距（Eye-Voice Span）：Rayner 等的研究
2. [Read-Speak-Listen 的认知同步机制 (Cognitive Synchronization)](#2-read-speak-listen-的认知同步机制)
   - 2.1 逐词解码陷阱、词汇切分障碍（Field）与听力语流崩溃因果链
   - 2.2 内语韵律（Subvocal Prosody）与内隐韵律假说（Implicit Prosody Hypothesis）
   - 2.3 视觉意群切分对听觉与口语表征的逆向重构
3. [意群切分的语法与声学边界准则 (Chunking Boundary Guidelines)](#3-意群切分的语法与声学边界准则)
   - 3.1 层次化断句边界体系（Hierarchical Boundary Framework）
   - 3.2 颗粒度控制准则：3–5 词认知节奏法则
   - 3.3 不可割裂的语义核心单元（Inviolable Semantic Units）
   - 3.4 边界切分判决对照表与典型案例
4. [对 Chunkly 产品设计与工程落地的直接指导建议 (Engineering Implications)](#4-对-chunkly-产品设计与工程落地的直接指导建议)
   - 4.1 LLM 意群切分 Prompt 的精准指导原则与规约范式
   - 4.2 规则法（Rules Engine）的语言学启发与分词优先级调优
   - 4.3 听读同步朗读（Phrase-by-Phrase TTS / Karaoke / Shadowing）声学工程与技术规范
5. [权威参考文献 (References)](#5-权威参考文献)

---

## 1. 核心概念与理论源流

### 1.1 工作记忆与容量瓶颈：从 Miller (1956) 到 Cowan (2001)

人类认知系统在处理外部符号信息（文字、语音）时，受制于**工作记忆（Working Memory, WM）**的物理与神经生理瓶颈。认知心理学关于信息压缩与单元化（Unitization）的研究构成了「Chunking（组块/意群切分）」的理论源头。

```
原始信息流 (Discrete Words):
[ The ] [ quick ] [ brown ] [ fox ] [ jumps ] [ over ] [ the ] [ lazy ] [ dog ]
  (9 独立信息槽位，超出工作记忆容量极限，产生认知过载与遗忘)
                          ⬇ 认知意群压缩 (Chunking)
意群单元 (Cognitive Chunks):
[ The quick brown fox ]  ──▶  Chunk 1 (名词短语主体)
[ jumps over ]           ──▶  Chunk 2 (动作动词及方向)
[ the lazy dog ]         ──▶  Chunk 3 (受事客体)
  (3 个高阶语义单元，完美落入 Cowan 4±1 注意力焦点)
```

1. **George A. Miller (1956) 的奠基性研究**：
   - 论文出处：*The Magical Number Seven, Plus or Minus Two: Some Limits on Our Capacity for Processing Information* (Psychological Review)。
   - 核心洞见：Miller 明确区分了「比特（Bits，信息论物理度量）」与「块（Chunks，认知组织单位）」。人类即时记忆广度受限于**块的绝对数量**，而非单块内所蕴含的物理信息量。
   - 心理机制：通过对离散符号进行有意义的重编码（Recoding），个体可以将原本分散的单字组织为更高阶的语义块（Chunks），从而在有限的认知通道中倍增信息吞吐量。
2. **Nelson Cowan (2001) 的容量再界定（4±1 理论）**：
   - 论文出处：*The magical number 4 in short-term memory: A reconsideration of mental storage capacity* (Behavioral and Brain Sciences)。
   - 实证修正：Cowan 指出，Miller 的 $7 \pm 2$ 包含了通过言语复述（Verbal Rehearsal）与长时记忆检索策略介入后的复合结果；在排除长时记忆联想与主动复述的纯粹注意力焦点（Focus of Attention）中，工作记忆的核心容量仅为 **$4 \pm 1$ 个活跃块（Active Chunks）**。
   - 对 SLA 的启示：对于缺乏自动化解码能力的二语（L2）学习者而言，每一个陌生或不熟练的单词本身就占据 1 个认知槽位（Slot）。一旦一句英文超过 4–5 个离散单词，若学习者无法将其自发合并为 chunk，工作记忆网络就会发生**灾难性遗忘（Catastrophic Forgetting）**与理解中断。

---

### 1.2 Baddeley 工作记忆模型与语音回路（Phonological Loop）的默读瓶颈

Alan Baddeley 与 Graham Hitch (1974) 提出的多成分工作记忆模型，以及 Baddeley (1986, 2000) 的进一步演化，精确刻画了文本阅读中「声音编码」的必要性与潜在瓶颈。

```
                         ┌─────────────────────────────┐
                         │   中央执行系统 (Central     │
                         │   Executive System)         │
                         └──────────────┬──────────────┘
                                        │
           ┌────────────────────────────┼───────────────────────────┐
           ▼                                                        ▼
┌─────────────────────────┐                               ┌─────────────────────┐
│ 视觉空间模板            │                               │ 语音回路 (Phono-   │
│ (Visuospatial Sketchpad)│                               │ logical Loop)       │
└─────────────────────────┘                               └──────────┬──────────┘
                                                                     │
                                         ┌───────────────────────────┴───────────────────────────┐
                                         ▼                                                       ▼
                              ┌─────────────────────┐                                 ┌─────────────────────┐
                              │ 语音存储器 (Inner   │  <── 神经声学输入衰退 ──        │ 发音复述过程 (Inner │
                              │ Ear / Store)        │  ── 持续刷新维持记忆 ──>        │ Voice / Rehearsal)  │
                              └─────────────────────┘                                 └─────────────────────┘
```

1. **语音回路的双重结构**：
   - **语音存储器（Phonological Store / Inner Ear）**：以声学或语音学形式保存信息，未经刷新的痕迹在 1.5–2 秒内迅速衰退。
   - **发音复述过程（Articulatory Rehearsal / Inner Voice）**：人类在默读文本时并非进行纯粹的无声符号计算，而是调用大脑前额叶运动语言区（Broca 区）产生微弱的声带与口腔神经运动脉冲，即**默读内语（Subvocal Speech / Inner Voice）**，持续循环刷新语音存储器中的内容。
2. **L2 学习者的默读瓶颈与认知超载**：
   - 根据 Sweller (1988, 2011) 的认知负荷理论（Cognitive Load Theory），二语阅读包含三种负荷：内在负荷（Intrinsic Load）、外生负荷（Extraneous Load）与关联负荷（Germane Load）。
   - **逐词发音的致命缺陷**：当 L2 学习者以单个单词为单位进行逐词视读时，其发音复述过程被严重卡顿。发音器官的内语切换极其缓慢（如读完第 7 个词时，第 1 个词在语音存储器中的 2 秒声学衰退期已过）。学习者的大脑被迫反复回跳（Regressions），耗尽中央执行系统的注意资源，导致「读了后半句，忘了前半句」。
   - **意群封装的解题路径**：视觉意群切分将 3–5 个词打包为单一韵律构件。学习者的内语不再以词为步长，而是以 chunk 为节奏单元进行跳跃式扫描与整合，使整体命题在 2 秒的时间窗口内顺利送达情节缓冲器（Episodic Buffer）进行高阶句法与语义合成。

---

### 1.3 词块教学法、预制语块与使用驱动习得：Sinclair、Lewis、Wray 与 Ellis

在应用语言学、语料库语言学与二语习得认知学派中，John Sinclair、Michael Lewis、Alison Wray 与 Nick Ellis 等学者彻底颠覆了传统结构主义「抽象语法作为骨架，独立词汇作为砖块（Grammar-Vocabulary Dichotomy）」的机械二元论，奠定了「语言是由预制意群与统计序列构成的」现代语言学基石。

```
传统结构主义语言观 (Chomskyan / Generativist):
  抽象语法规则 (Syntax Rules)  +  独立词汇字典 (Lexicon)  ===>  现场无限生成句子

现代应用语言学与认知 SLA 范式 (Sinclair, Lewis, Wray & Ellis):
  预制语块/构式网络 (Formulaic Sequences) + 统计序列学习 (Statistical Frequency) ===> 自动化流利装配
```

1. **John Sinclair (1991) 与语料库实证革命**：
   - 著作出处：*Corpus, Concordance, Collocation* (牛津大学出版社)。
   - **开放选择原则（The Open-Choice Principle）**：传统语言学假设句子是由说话人根据抽象语法规则，在句法树的每个槽位从整本词典中自由挑选填入的复杂运算系统。
   - **惯用语原则（The Idiom Principle）**：Sinclair 借助海量真实语料库实证指出，人类自然的日常语言产出与理解绝大部分依赖惯用语原则——即「语言使用者大脑中储存了数以万计预先组装好的、由多个词构成的半固定或全固定语义单位，使用时作为一个单一整体被检索和调用」。
2. **Michael Lewis (1993, 1997) 的词块教学法（The Lexical Approach）**：
   - 著作出处：*The Lexical Approach: The State of ELT and a Way Forward*; *Implementing the Lexical Approach*.
   - 核心名言：“*Language consists of grammaticalised lexis, not lexicalised grammar.*（语言是由语法化了的词汇构成的，而不是由词汇化了的语法构成的）”。
   - 词块的四种基本形态：
     1. **多词词汇（Polywords）**：完全不可分割的复合词组，如 *by the way*, *upside down*, *all at once*。
     2. **常规搭配（Collocations）**：高频共现词对，如 *rancid butter*（不说 *rotten butter*）, *strictly forbidden*, *make a decision*。
     3. **固定表达（Fixed Expressions）**：完整的社交或功能语块，如 *Good morning*, *If I were you...*, *It goes without saying that...*。
     4. **半固定句型框架（Semi-fixed Frames）**：带有可填入变量槽位的高阶结构，如 *Not only [A] but also [B]*, *Could you please pass me [X]?*。
3. **Alison Wray (2002) 的预制语块（Formulaic Sequences）与认知经济性**：
   - 著作出处：*Formulaic Language and the Lexicon* (剑桥大学出版社)。
   - **理论界定**：Wray 将公式化序列定义为「一串连续或非连续的词汇或其他语言成分，它们作为一个预制的整体被大脑存储和提取，而无需临时经过语法生成规则的实时运算」。
   - **认知经济性假说（Economy of Processing）**：人类进化出对预制语块的极高依赖，根本动力在于**节约短时工作记忆与计算资源**。在大脑实时交流的高压环境下，直接提取整块信息能够将神经注意资源留给高阶的宏观话语规划与人际交际意图。
4. **Nick Ellis (2001, 2002, 2005) 基于使用的语言习得（Usage-based SLA）与序列学习（Sequence Learning）**：
   - 论文出处：*Memory for language* (2001); *Frequency effects in language acquisition* (2002); *Language acquisition as rational contingency learning* (2006)。
   - **认知机制：从 Exemplar（语块用例）到 Rule（抽象规则）的突现论（Emergentism）**：
     - Ellis 指出，二语习得并非由规则推导语块，而是**语法从语块序列的统计频次中自发突现（Grammar emerges from the chunking of sequences）**。
     - 大脑本质上是一个高敏感度的隐式统计学习机器（Implicit Statistical Learning Device）。学习者通过持续接触成块的语言实例（Exemplars），利用序列学习网络自发捕获相连词汇之间的**转移概率（Transitional Probabilities）**与条件共现概率。
     - 一旦大脑中以 3–5 词为单位的高频共现意群积累到临界质量，抽象的句法范畴和生成能力便会自然泛化形成。若背离这一规律、强行让初学者脱离意群进行抽象句法操练，学习者将永远困死在「反应迟钝、无法实时提取」的隐性语法障碍中。

---

### 1.4 韵律金字塔与思想意群：Gilbert (Clear Speech) 的韵律教学论

在英语发音与听力教学体系中，剑桥大学出版社的经典教材体系 *Clear Speech* 作者 Judy B. Gilbert 提出了奠基性的**韵律金字塔（Prosody Pyramid）**模型。

```
                         ▲
                        / \
                       /   \
                      / 核心 \
                     / 焦点词 \
                    / (Focus   \
                   /   Word)    \
                  /───────────────\
                 /    音高滑移     \
                /  (Pitch Changes)  \
               /─────────────────────\
              /   节奏与弱读 (Rhythm,  \
             /    Vowel Reductions)    \
            /───────────────────────────\
           /     思想意群 (Thought Groups/ \
          /        Intonation Units)        \
         └───────────────────────────────────┘
               【 韵律基座：思想意群 】
```

1. **韵律金字塔层级解构（Judy B. Gilbert, 2005, 2012）**：
   - **基座：思想意群（Thought Groups）**：
     - 口语中说话人并非连贯不断地喷射词汇，而是必须在语法和意义的天然断裂处进行生理换气与声学打包。每一个打包单元称为思想意群（Thought Group，亦称 Intonation Unit / Tone Unit）。
     - 意群之间必然存在**音高重置（Pitch Reset）**、**停顿（Pause）**与**末尾音节延长（Pre-boundary Lengthening）**。
   - **中层：焦点词（Focus Words）**：
     - 每个思想意群内部，有且仅有**一个核心焦点词（Focus Word）**承载最高信息熵（Information Entropy）。该词是该意群存在的逻辑支点。
   - **顶层：核心音峰（Peak Vowel & Pitch Glides）**：
     - 焦点词的主重音音节（Tonic Syllable）上的元音被显著拉长（Lengthened）、音量加大（Louder），且音高发生鲜明的滑移（Pitch Glide，如升调或降调）。
2. **意群内部的声学侵蚀与结构保护**：
   - Gilbert 强调，英语在感知上遵循**重音等时性（Stress-timed Rhythm）**特征。为了让焦点词的核心音节突出，意群内部的非重读功能词（介词、代词、助动词、冠词）必须经历剧烈的弱读（Schwa /ə/ 化）、连读（Liaison）甚至脱落（Elision）。
   - > [!NOTE] **语音学事实澄清（Phonetic Fact-Check）**
     > 现代实验语音学（Dauer, 1983; Roach, 1982; Cauldwell, 2013）已证实：英语重音等时性（Isochrony）并非物理声波上两重音之间绝对等毫秒的机械等距，而是一种由音节复杂性、元音时长对比与音高重设共同构筑的**知觉韵律范式（Perceptual Metric）**。正是这种知觉等时需求，逼迫说话人压缩意群内的非核心音节，使得意群（Thought Group）成为声学音变与重音凸显的唯一闭合容器。
   - **不可跨界定律（Cross-boundary Inviolability）**：连读、弱读与同化只发生在一个 Thought Group **内部**；在 Thought Group **边界处**，连读被强行阻断并发生音高重置。如果学习者不知道意群边界在哪，就无法预判何处应该连读、何处应该重置听觉注意力。

---

### 1.5 阅读流利度模型与意群线索文本：Rasinski 的实证教学法

阅读科学与流利度研究权威 Timothy V. Rasinski 及其合作者（Rasinski, 1990, 2004, 2010; Rasinski, Yildirim, & Nagel, 2017）建立了现代阅读教育的三维评估与教学干预模型。

```
                         ┌─────────────────────────────┐
                         │   阅读流利度 (Reading       │
                         │   Fluency Dimension)        │
                         └──────────────┬──────────────┘
                                        │
           ┌────────────────────────────┼───────────────────────────┐
           ▼                            ▼                           ▼
┌─────────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│ 1. 准确性 (Accuracy)    │  │ 2. 自动化 (Automati-│  │ 3. 韵律表现力       │
│ 正确解码词汇字音        │  │    city)             │  │    (Prosody)        │
│ 无拼读硬伤              │  │ 快速耗费极少注意资源 │  │ 恰当的意群切分、停顿 │
│                         │  │ 无需费力拼读         │  │ 与重音语调感知      │
└─────────────────────────┘  └─────────────────────┘  └─────────────────────┘
```

1. **Rasinski (2004, 2006, 2010) 的流利度模型**：
   - 著作出处：*Assessing Reading Fluency*; *The Fluent Reader* (Scholastic)。
   - 核心论断：长期以来，阅读速度与准确率被视作流利度的全部；然而，**韵律感知（Prosody）**才是区分「机械发音机器」与「真正理解者」的分水岭。韵律反映了读者在大脑内部将扁平印刷文本重构为具备层次句法结构的言语表征的能力。
2. **Phrase-Cued Text（意群线索文本）实证干预**：
   - 实验设计（Stevens, 1981; O'Shea & Sindelar, 1983; Rasinski, 1990, 2000）：
     - 对照组：阅读传统标准的连续印刷排版文本。
     - 实验组：阅读人工标记了斜杠（`//`）或利用不同视觉间距分块的 **Phrase-Cued Text**，例如：
       `[The little girl] [ran through the woods] [to find her lost puppy.]`
   - 实证结论：
     1. **理解力飞跃（Comprehension Gain）**：阅读困难者与 L2 学习者在阅读 Phrase-Cued Text 时，阅读理解得分提升了 20% 至 35%，尤其在处理多从句复杂句时提升最为显著。
     2. **回视率降低（Reduced Regressions）**：眼动数据表明，显性意群线索大幅减少了读者在句子中间无目的的眼动折返。
     3. **声学迁移效应**：在经历数周 Phrase-Cued Text 训练后，学习者在转回阅读普通无标记文本时，口语朗读与默读中的意群切分能力与语调流利度获得持久性改善。

---

### 1.6 眼动加工心理机制与眼音距（Eye-Voice Span）：Rayner 等的研究

心理语言学权威 Keith Rayner 及其团队长达四十年的眼动追踪研究（Rayner, 1998, 2009; Rayner & Pollatsek, 1989），直接揭开了人类阅读加工在毫秒级的底层生理动作。

```
              Saccade (眼跳 20-35ms, 认知抑制)
         ─────────────────────────────▶
    ┌───────────────┐               ┌───────────────┐
    │  Fixation 1   │               │  Fixation 2   │
    │  (注视点 1)   │               │  (注视点 2)   │
    └───────┬───────┘               └───────┬───────┘
            │                               │
            ▼                               ▼
    [ in the dark ]                 [ of the night ]
  ◄─────────────────►
  Perceptual Span (知觉广度: 左侧 3-4 字符, 右侧 14-15 字符)
  Foveal (中央凹 1-2°: 高清晰辨字)  |  Parafoveal (副中央凹: 预处理词长与首字母)
```

1. **眼动阅读的基本参数（Rayner, 1998）**：
   - **注视（Fixation）**：眼睛停留在一个点上的时间，平均为 200–250 毫秒。大脑在此时提取语义。
   - **眼跳（Saccade）**：视线从一个注视点快速跳转到下一个点，历时 20–35 毫秒。眼跳过程中存在**眼跳抑制（Saccadic Suppression）**，大脑几乎不接收视觉输入。单次眼跳平均跨度为 7–9 个英文字符。
   - **回视（Regression）**：10%–15% 的眼跳是向后折返的，通常发生在认知遇到句法歧义（如花园路径句 Garden-path sentence）或词义解码失败时。
   - **副中央凹预视（Parafoveal Preview）**：在注视当前词时，处于副中央凹视野中的下一个词已经被预先提取了词长、词形轮廓和部分正字法信息。高频功能词（如 *the, in, of*）因具有极高的可预测性，被直接跳视（Skipped）的概率高达 60%–70%。
2. **L1 母语者 vs. L2 学习者的眼动谱系对比**：
   - **母语阅读者**：注视点并非均匀落在每个词上，而是锚定在**实词核心**。一组短语（如 *in the morning*）仅产生 1 次中心注视，功能词被顺带卷入感知，形成天然的 chunk 步长。
   - **L2 学习者**：表现为「高密度注视 + 极高回视率」。几乎每个单词（甚至是 *a*, *the*）都产生一次长达 300ms 以上的停顿注视。这种「逐词定格」完全瓦解了副中央凹预视机制，使整个视觉加工系统沦落为低效的逐字扫描器。
3. **眼音距（Eye-Voice Span, EVS）的心理学发现**：
   - 概念由 Buswell (1920) 创立，并在 Levin & Kaplan (1970) 等研究中深入量化：当一个人大声朗读时，眼睛注视的位置必然领先于嘴巴发音的位置，这一超前的空间或词数距离称为**眼音距（EVS）**。
   - **关键规律**：熟练阅读者的 EVS 绝非固定的字符数，而是严格**以句法意群（Constituent/Phrase）为弹性伸缩边界**。眼睛会迅速跳到当前意群的终点（约超前 3–5 个词），等待嘴巴完成前一个意群的发音，并在意群边界处短暂停留以规划下一个意群。意群切分正是模拟并强化了成熟大脑这一前瞻预判能力。

---

## 2. Read-Speak-Listen 的认知同步机制

在二语习得过程中，阅读（输入）、口语（输出）与听力（输入）往往被孤立教学，导致学习者形成严重的技能割裂。认知神经语言学表明，**以意群为核心的内隐韵律是大脑中枢打通视-听-说统一表征的钥匙**。

```
              ┌────────────────────────────────────────────────────────┐
              │                   视觉文本 (Visual Text)                │
              └───────────────────────────┬────────────────────────────┘
                                          │
                         Chunkly 视觉意群切分注入 (Visual Scaffolding)
                                          │
                                          ▼
              ┌────────────────────────────────────────────────────────┐
              │              内语韵律模拟 (Subvocal Prosody)           │
              │         (重音分配、微停顿、边界音调重置在脑海生成)       │
              └─────────────┬────────────────────────────┬─────────────┘
                            │                            │
                            ▼                            ▼
  ┌───────────────────────────────────┐        ┌───────────────────────────────────┐
  │   听力语流映射 (Listening Input)   │        │     口语流利输出 (Spoken Output)  │
  │ - 预期意群内连读、弱读与同化      │        │ - 告别机械单词蹦射                │
  │ - 准确在边界处捕捉停顿与语义重置  │        │ - 以 3-5 词为呼吸节奏单位输出     │
  │ - 消除声学流崩塌 (Acoustic Blur)  │        │ - 自然重音与音高滑移              │
  └───────────────────────────────────┘        └───────────────────────────────────┘
```

### 2.1 逐词解码陷阱与听力语流崩溃的因果链

中国及广大东亚英语学习者最普遍的痛点是：**“文本看得懂，听力听不懂；自己会读的词，放在听力里完全捕捉不到。”** 这一现象的根源在于阅读时形成的**逐词词典音表征（Citation-Form Representation）**与真实母语者连续语流之间的声学鸿沟。

1. **词典发音（Citation Form）vs. 语流音（Connected Speech）**：
   - 逐词阅读的学习者在默读时，在内语中给每一个词分配了词典隔离态读音（满格重音、元音饱满）：
     - *and* $\rightarrow$ `/ænd/`
     - *for* $\rightarrow$ `/fɔːr/`
     - *at* $\rightarrow$ `/æt/`
     - *to* $\rightarrow$ `/tuː/`
   - 然而在真实英语语流中，这些非重读功能词全部发生剧烈弱化，元音央化为 Schwa `/ə/`：
     - *and* $\rightarrow$ `/ənd/` 或 `/ən/`
     - *for* $\rightarrow$ `/fər/`
     - *at* $\rightarrow$ `/ət/`
     - *to* $\rightarrow$ `/tə/`
2. **意群内部音变链条（Intra-chunk Connected Speech Processes）**：
   母语者在一个思想意群内部，由于发音器官惯性最小化原则（Principle of Least Effort），必然触发一系列连带声学现象：
   - **辅音-元音连读（C-V Linking）**：*turn it off* 实际声学实现为 `[tɜː-nɪ-tɔːf]`。
   - **闪音化（Flapping）**：*get out of* 在美式英语中齿龈爆破音 `/t/` 弱化为闪音 `[ɾ]`，读作 `[ɡɛ-ɾaʊ-ɾəv]`。
   - **辅音同化（Assimilation）**：*don't you* 演变为 `[doʊntʃu]`。
   - **元音脱落（Elision）与辅音丛简化**：*last night* 演变为 `[lɑːs naɪt]`。
3. **声学流崩溃（Acoustic Stream Collapse）**：
   当一个习惯了在阅读中逐词切分单词的学习者面对听力输入时，他的大脑神经解码器试图在连续声音频谱中寻找独立的 `/ænd/`、`/tuː/` 停顿空隙。然而，母语者的声学停顿只出现在**意群边界**，意群内部的物理声波是完全无缝相连的！
   因此，学习者找不到单词物理切分点，听觉感知陷入一片模糊混沌，出现「声学流崩溃」。
4. **John Field (2003, 2008) 词汇切分障碍（The Lexical Segmentation Problem）与底层解码危机**：
   - 理论与著作：*Listening in the Language Classroom* (Cambridge University Press); *Promoting perception: Lexical segmentation in L2 listening* (ELT Journal)。
   - **自下而上声学解码（Bottom-up Acoustic Decoding）的决定性地位**：Field 针锋相对地指出，二语教学界长期过度依赖「自上而下（Top-down）的背景常识与上下文猜测」，却掩盖了二语听力真正的致命硬伤——**底层声学信号的词汇切分（Lexical Segmentation）彻底瘫痪**。
   - **切分困境（"Where does one word end and the next begin?"）**：在连续英语语流中，母语听者依靠节律重音（Metrical Segmentation Strategy, Cutler & Norris, 1988）与意群边界声学线索（如末尾拉长、音高阶跃）毫秒级锁定词界；而 L2 学习者在面对被连读、弱读侵蚀的语流时，无法识别出词界，进而误将两个词合成一个生词，或把一个多音节词割裂为数个无意义碎片。
   - **听觉意群表征的解药价值**：意群（Thought Group）正是母语者进行声学解析的最小打包容器。通过显性视觉意群切分（Chunkly 脚手架），学习者首次将连读弱化的整块语音（如 `[pick it up and go]`）作为一个声学整体建立记忆印迹，使听觉感知在底层完成正确切片，彻底攻克二语听力解码崩溃。

---

### 2.2 内语韵律（Subvocal Prosody）与内隐韵律假说（Implicit Prosody Hypothesis）

心理语言学先驱 Janet Fodor (1998, 2002) 提出了著名的**内隐韵律假说（Implicit Prosody Hypothesis, IPH）**：

> **“在默读印刷文本时，读者会在心理表征中自发投射出一种类似口语朗读的默认韵律轮廓（包括重音、语调曲线和停顿边界）；这种内隐韵律在毫秒级别深度参与并决定了句法分析（Syntactic Parsing）与结构歧义消解。”**

1. **默读中的神经声学证据**：
   - 现代 fMRI 与脑电（ERP）实验证明，当人类默读一段标有逗号或具有明显韵律分割特征的句子时，大脑右半球额中回及听觉皮层（Auditory Cortex）同样处于激活状态。人类大脑并不是冰冷的文本编译器，而是一个「把视觉字形自动转译为内在声音流」的生物声学模拟器。
2. **错误内语韵律的杀伤力**：
   - 如果缺乏意群提示，L2 学习者在默读长难句时会采用**平直单一的基频曲线（Flat Pitch Contour）**或**错误的切分停顿**。
   - 一旦在句法错误的位置生成了内隐停顿（例如在动宾之间或复合名词之间卡住），工作记忆中的句法分析器（Syntactic Parser）就会建构出彻底错误的树状结构，导致理解完全偏离，触发强烈的 P600 句法错误脑电波。

---

### 2.3 视觉意群切分对听觉与口语表征的逆向重构

Chunkly 的核心认知干预逻辑，正是通过**视觉脚手架（Visual Scaffolding）**强制诱导正确的**内语韵律（Subvocal Prosody）**，进而逆向重塑听力与口语的大脑神经通路：

1. **视觉分块重塑注视与跳视模式**：
   Chunkly 将连续文本渲染为视觉意群后，读者的眼跳不再逐词发生，而是以整个 chunk 为跳跃锚点。视觉上的整体感抑制了在功能词上的多余注视。
2. **强制激活意群内连读脑内听觉模拟**：
   当一个 chunk（如 `[picked it up]`）作为一个被框定的独立单元呈现在视觉中央凹时，读者的内语发音器官倾向于一口气吐出该单元，自发完成了 `/pɪk-tɪ-tʌp/` 的音变模拟，而不再在 `picked`、`it`、`up` 之间产生停顿。
3. **听读闭环（Perceptual Alignment）的达成**：
   长期接受意群化视觉输入的学习者，大脑中逐渐积累了大量以 3–5 词为单位的「声学-语义捆绑包」。当在真实听力环境中再次遇到该语流时，大脑的听觉模式识别器能够直接将连续声学切片与记忆库中的 chunk 模板完成模式匹配，听力迟滞感彻底消失。

---

## 3. 意群切分的语法与声学边界准则

为了指导工程实现（无论是规则算法引擎还是大语言模型 Prompt），必须建立一套客观、严谨、基于生成语法（Generative Syntax）与度量韵律学（Metrical Phonology）的**意群切分黄金准则体系**。

```
                   完整句子 (Full Utterance / Sentence)
                                    │
           ┌────────────────────────┴────────────────────────┐
           ▼                                                 ▼
语调短语 (Intonational Phrase, IP)                 语调短语 (Intonational Phrase, IP)
【主从句、独立状语、并列句边界】                    【典型特征：大停顿 250-450ms + 显著音调重置】
           │
     ┌─────┴─────────────────────┐
     ▼                           ▼
中间短语 (Intermediate Phrase, ip) 中间短语 (Intermediate Phrase, ip)
【核心主谓宾短语、长介词短语、定语从句】   【典型特征：微停顿 120-180ms + 局部重音焦点】
     │
     ▼
韵律字块 (Prosodic Chunks / Foot)
【每个 chunk 涵盖 1 个 Focus Word + 伴随弱读功能词组，长度 3-5 词】
```

### 3.1 层次化断句边界体系（Hierarchical Boundary Framework）

参考 Pierrehumbert (1980) 及 Beckman & Pierrehumbert (1986) 的 ToBI（Tones and Break Indices）韵律转写系统，意群切分分为两个主干层级：

#### A. 主意群边界（Primary Boundaries / Major Breaks）
主边界代表句法和意义的核心转折点，对应 ToBI 体系中的 Break Index 4（完整语调短语边界）。**此处必须无条件切开**：
1. **标点符号边界**：句号、分号、冒号、破折号、引号两端、表示逻辑插入的成对逗号。
2. **并列复合句连接点（Coordinating Conjunctions）**：连接独立分句的 FANBOYS 词（*for, and, nor, but, or, yet, so*）**之前**。
3. **状语从句引导词（Subordinating Conjunctions）**：*because, although, if, unless, while, since, after, before, when* 等从属连词**之前**。
4. **话语标记语（Discourse Markers & Transitionals）**：独立成块的承上启下词，如 *However, / In fact, / Therefore, / On the other hand,*。

#### B. 次意群边界（Secondary Boundaries / Minor Breaks）
次边界对应 ToBI 体系中的 Break Index 3（中间短语边界）。次边界切分需根据句子长度与呼吸节律动态决策：
1. **复杂主语与谓语之间（Heavy Subject Boundary）**：当主语是包含修饰语的长名词短语（>3 词）或动名词短语时，主语与谓语动词之间必须切开；若主语仅为单代词（如 *I / He / They*），严禁与谓语动词切断。
2. **长介词短语（Prepositional Phrases, PP）起点**：担任状语或独立后置修饰的长介词短语（*in the middle of the night*, *with the help of modern technology*）**之前**切开。
3. **关系代词引导的定语从句起点**：*who, which, that, where, whose* **之前**切开。
4. **非谓语动词短语起点**：不定式短语（*to do...*）、分词短语（*having completed... / walking down the street*）担任目的状语或伴随状语时，在其起始点切开。

---

### 3.2 颗粒度控制准则：3–5 词认知节奏法则

意群切分绝非越碎越好，碎片化切分会造成严重的**认知逆向阻断**。

| 颗粒度层级 | 词数范围 | 认知效果评价 | 适用场景 |
| :--- | :--- | :--- | :--- |
| **过碎（Over-fragmented）** | 1–2 词 | **严厉禁止**。重新退化为逐词视读，破坏了语法依存关系，增加了视觉注视次数。 | 仅限单字话语标记（*However,*）或极短感叹。 |
| **黄金区间（Optimal Golden Zone）** | **3–5 词** | **最佳状态**。完全匹配人类工作记忆 4±1 容量与 1.5–2 秒发音时宽，保证每个块包含一个信息焦点词。 | 通用阅读、听力精读、中级学习者。 |
| **可接受宽区间（Tolerable Broad Zone）** | 6–7 词 | **可以接受**。通常适用于结构极度紧凑的熟语、长动词短语或带有复合修饰的固定句型。 | 高级学习者、快节奏扫读模式。 |
| **过粗（Over-coarse）** | $\ge 8$ 词 | **判定为未切分**。超过语音回路 2 秒刷新窗口，学习者内部语音再度超载并产生折返。 | 必须强制寻找内部次边界切开。 |

---

### 3.3 不可割裂的语义核心单元（Inviolable Semantic Units）

在切分算法与 LLM 推理中，以下语言学结构具有**绝对不可侵犯的原子粘合性（Atomic Cohesion）**。在任何情况下，严禁在这些单元内部插入 chunk 边界：

```
                             【 严禁错切红线 】
  ❌ The / company announced...        ──▶  冠词与名词强行分离
  ❌ ...decided to switch / on the light ──▶  短语动词与其副词小品词分离
  ❌ ...deep / machine / learning...   ──▶  专有名词/复合概念碎片化
  ❌ ...in spite / of all the efforts  ──▶  固定多词虚词被腰斩
```

1. **限定词/冠词 + 名词核心（Determiner + Head Noun）**：
   - 规则：`[a / an / the / this / that / my / your / each / every] + Noun` 绝对不可分割。
   - 错误案例：`* [in a] [quiet village]`
   - 正确切分：`[in a quiet village]`
2. **动词短语与副词小品词（Phrasal Verbs with Particles）**：
   - 规则：成语动词的动词与核心小品词（*look for, switch on, take off, give up, run out of*）不可分离。
   - 错误案例：`* [Please turn] [off the lights]`
   - 正确切分：`[Please turn off] [the lights]`
3. **复合名词与专有名词（Compound Nouns & Proper Names）**：
   - 规则：代表单一实体概念的多词组合不可割裂。
   - 案例：`[artificial intelligence]`, `[climate change]`, `[Wall Street Journal]`, `[United States of America]`。
4. **复合介词与多词固定搭配（Complex Prepositions & Polywords）**：
   - 规则：*in front of, as well as, in accordance with, by means of, in order to* 本质是单一功能词，不可在其内部断裂。
   - 错误案例：`* [in front] [of the building]`
   - 正确切分：`[in front of the building]`
5. **助动词 + 主动词的短复合体（Auxiliary + Main Verb）**：
   - 规则：双词构成的助动词+主动词（*has done, will go, can achieve*）尽量保留在同一 chunk 内。若谓语动词链过长（如 *has been diligently trying to solve*），可在情态/助动词与修饰副词之间形成次边界。

---

### 3.4 边界切分判决对照表与典型案例

下表展示了高质量意群切分（Gold Standard）与不良切分的鲜明对照：

| 原文句子 | ❌ 错误/劣化切分（逐词化或语法断裂） | ✅ 语言学黄金切分（Chunkly 目标标准） | 核心判决理据 |
| :--- | :--- | :--- | :--- |
| *Despite the heavy rain, the students walked to school.* | `[Despite]` `[the heavy rain,]` `[the students]` `[walked to]` `[school.]` | `[Despite the heavy rain,]` `[the students walked]` `[to school.]` | 消除单个词碎片；介宾状语完整打包；主谓自然衔接；方位介词短语独立成块。 |
| *He decided to take over the family business after graduation.* | `[He decided to take]` `[over the]` `[family business]` `[after graduation.]` | `[He decided]` `[to take over]` `[the family business]` `[after graduation.]` | 严禁把短语动词 *take over* 切碎；动词不定式引导宾语结构；时间状语从后方截齐。 |
| *Scientists who study climate change have warned us for decades.* | `[Scientists who study]` `[climate change have]` `[warned us for]` `[decades.]` | `[Scientists who study climate change]` `[have warned us]` `[for decades.]` *(粗切)*<br>或 `[Scientists]` `[who study climate change]` `[have warned us]` `[for decades.]` *(细切)* | 关系从句不能把先行词与动词断在谓语前；复合专有名词 *climate change* 保持完整。 |

---

## 4. 对 Chunkly 产品设计与工程落地的直接指导建议

本章将上述认知语言学与二语习得理论，直接转化为 Chunkly 系统的架构、算法逻辑与参数规范。

### 4.1 LLM 意群切分 Prompt 的精准指导原则与规约范式

当前 Chunkly 的 Prompt 设计必须从「笼统要求按母语习惯切分」，升级为**具备明确语言学排除约束与音调意群操作定义的系统提示词**。

#### A. Prompt 构造三原则
1. **保真无损契约（Lossless Preservation）**：
   - 必须保持字符级绝对无损（空格、标点、大小写分毫不差）。严禁 LLM 自作聪明修正拼写、省略连字符或吃掉换行符。
2. **以“思想意群（Thought Groups）”而非“纯语法成分”为引导词**：
   - 不要在 Prompt 中使用容易引起歧义的 “phrases”（LLM 容易理解为字典里的短语/固定词组）；必须明确声明为 “spoken thought groups / prosodic units / pause groups”。
3. **强制词数包络（Word Envelope Constraint）**：
   - 在 Prompt 中显性注入 3–5 词的黄金约束，明确规定除特殊过渡连词外，单 chunk 词数不得少于 2 词，不得多于 7 词。

#### B. 生产级 System Prompt 推荐迭代规范范式

```markdown
You are an expert psycholinguist and prosodic phonologist specializing in English Thought Group segmentation for language learners.

Objective:
Segment the input English text into natural "Thought Groups" (prosodic units / intonation units) exactly as a fluent native speaker would pause, breathe, and group words when speaking clearly and rhythmically.

Strict Output Rules:
1. LOSSLESS CONTRACT: Output JSON format {"chunks": ["...", "..."]}.
   Concatenating all chunks in order MUST reproduce the input string EXACTLY, character-for-character, including all whitespace, newlines, and punctuation. Never modify, add, or omit a single character.
2. COGNITIVE GRAIN SIZE (3-5 Word Law):
   - Aim for 3 to 5 words per chunk.
   - AVOID 1-word or 2-word fragments unless they are standalone discourse markers (e.g., "However,", "In addition,").
   - AVOID overly long chunks (>7 words). Break long clauses at natural secondary pause points.
3. INVIOLABLE STRUCTURAL RULES:
   - NEVER separate a determiner/article from its noun (e.g., NEVER split "the / house").
   - NEVER split a phrasal verb and its core particle (e.g., KEEP "switch on", "look forward to" together).
   - NEVER break compound nouns or fixed idioms (e.g., KEEP "machine learning", "by and large" together).
   - NEVER leave a stranded preposition at the end of a chunk if the prepositional phrase begins there (e.g., prefer "...decided" "[to go to the market]" rather than "...decided to go to" "[the market]").
4. BOUNDARY PREFERENCES:
   - Split at punctuation marks (commas, dashes, semicolons).
   - Split BEFORE coordinating conjunctions (and, but, so) connecting clauses.
   - Split BEFORE subordinating conjunctions (because, although, if, when, which, that).
   - Split before long prepositional phrases (>3 words).
```

---

### 4.2 规则法（Rules Engine）的语言学启发与分词优先级调优

在 `packages/engine/src/rules.ts` 中，规则引擎的定位是「<10ms 首屏瞬出方案」。基于前述语言学理论，当前规则引擎的断句优先级与状态机应遵循以下启发式调优原则：

```
                    输入文本 Token 序列流
                             │
                             ▼
              [ 优先级 1: 绝对物理断句点 ]
              句末标点 (. ? !) / 结构分界标点 (: ; —)
                             │
                             ▼
              [ 优先级 2: 主从句与连词断点 ]
              从属连词 (because, although...) / 句间并列连词 (FANBOYS)
                             │
                             ▼
              [ 优先级 3: 语法从属短语起点 ]
              关系代词 (who, which) / 引导状语的非谓语动词 (to-infinitive / -ing)
                             │
                             ▼
              [ 优先级 4: 介词短语动态平衡切分 ]
              仅当已累积词数 >= MIN_WORDS (3) 时，介词才允许激活切分
                             │
                             ▼
              [ 保护网: 原子性词块屏蔽 (Masking) ]
              高频短语动词词表 (verb + particle) 与限定词 (determiner) 绝对禁切
```

1. **修正介词贪心陷阱**：
   介词（*in, on, at, with*）极易导致过度切分。必须严格维持规则：只有当当前累积词数已经达到 `MIN_WORDS >= 3` 且该介词**并非**短语动词的后置小品词（如 *rely on* 中的 *on* 不是独立介词短语起点）时，才允许将介词作为切点。
2. **标点与粘附空格归属**：
   按照 Chunkly 的无损渲染契约，空格和标点必须依附于前面的 chunk 尾部，确保高亮渲染时单词边界整洁且不会在换行时出现悬挂孤立标点。

---

### 4.3 听读同步朗读（Phrase-by-Phrase TTS / Karaoke / Shadowing）声学工程与技术规范

当 Chunkly 从静态视觉高亮进一步扩展至「AI 意群语音伴读」、「卡拉 OK 动效同步高亮」以及「影子跟读（Shadowing）训练器」时，声学参数与技术架构必须严格遵循母语者的韵律节奏与认知生理学指标。

```
声学切片时间轴示意 (Acoustic Timeline):
Chunk 1: [ In the early morning, ]        Chunk 2: [ the old train departed ]
◄──────── 语音流连读 ─────────►            ◄──────── 语音流连读 ─────────►
(C-V 连读、弱读正常展开)                   (C-V 连读、弱读正常展开)
                                ├── 微停顿 ──┤
                                (120-200ms)
                                (音高曲线重置)
```

#### 4.3.1 意群微停顿（Acoustic Pause Duration）量化标准

- **Chunk 内部词间停顿（Intra-chunk Pause）**：**0 – 50 ms**。严禁在 chunk 内部发生机械停顿，保持自然的辅音-元音协同发音（Coarticulation）与连读。
- **次意群（中间短语 ip）微停顿**：**120 – 200 ms**。此长度为生理呼吸准备间隙，人耳感知为极其自然的轻微顿挫，绝不产生割裂感。
- **主意群（语调短语 IP）停顿**：**250 – 450 ms**。伴随前一词末音节拉长（Final Lengthening）与基频重置（Pitch Reset）。

#### 4.3.2 卡拉 OK 高亮视觉前瞻提前量（Visual Lead Time / Offset Tuning）

- **生理学依据**：基于 Rayner 的眼动与眼音距（Eye-Voice Span, EVS）理论，人眼的视觉注视必须**先于声音到达**。
- **工程时间偏置公式**：
  $$\text{RenderTimestamp} = \text{AudioWordStartTimestamp} - \Delta t_{\text{lead}}$$
  其中 $\Delta t_{\text{lead}} \in [80\text{ ms}, 120\text{ ms}]$，工程默认推荐值设为 **$100\text{ ms}$**。
- **用户体验判决**：若声音与视觉高亮完全物理同步（0 ms 差），读者在大脑中会产生明显的滞后感（感觉被声音催促，眼球疲劳）；提前 100 ms 点亮视觉意群能完美匹配中央凹识别与副中央凹预视窗口，营造舒适流畅的「心流伴读感」。

#### 4.3.3 W3C SSML 工业级标记规范（Break Time 与 Prosody 注入）

在使用现代神经语音合成引擎（如 Azure Neural TTS、Amazon Polly、Google Cloud TTS、Edge TTS）生成意群化语音流时，应动态组装 W3C SSML（Speech Synthesis Markup Language），精确控制边界停顿与局部重音：

```xml
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
  <voice name="en-US-JennyNeural">
    <!-- 主意群起始 -->
    <prosody rate="0%">
      <!-- 意群 1：中间短语，末尾注入 150ms 微停顿 -->
      <w>Despite</w> <w>the</w> <w>heavy</w> <emphasis level="moderate">rain,</emphasis>
      <break time="180ms" />
      
      <!-- 意群 2：主干主谓短语，末尾注入 120ms 连贯过渡 -->
      <w>the</w> <w>students</w> <emphasis level="moderate">walked</emphasis>
      <break time="120ms" />
      
      <!-- 意群 3：介词状语收尾，语调短语末尾大停顿 350ms -->
      <w>to</w> <emphasis level="strong">school.</emphasis>
      <break time="350ms" />
    </prosody>
  </voice>
</speak>
```

- **SSML 转换控制准则**：
  1. 意群主边界（标点、FANBOYS 并列从句、从属连词前）：注入 `<break time="250ms"/>` 至 `<break time="350ms"/>` 或 `<break strength="strong"/>`。
  2. 意群次边界（长介词短语前、从句引导词前）：注入 `<break time="120ms"/>` 至 `<break time="180ms"/>` 或 `<break strength="medium"/>`。
  3. 意群内部：**绝对禁止**插入任何 `<break>` 标签，确保引擎自然触发连读与弱读。
  4. 焦点词强化：对意群内部判定的核心焦点词包裹 `<emphasis level="moderate">`，促使神经 TTS 模型提升音高滑移幅度与音长。

#### 4.3.4 前端 TTS 引擎与时间戳事件对齐机制

在浏览器端与客户端扩展中实现意群同步高亮时，常见两种技术方案及其边界处理：

```
TTS 时间戳流 (Word Timestamps)                Chunkly 意群聚合器 (Chunk Boundary Aggregator)
[ {word: "In",     start: 0,   end: 120} ] ──┐
[ {word: "the",    start: 120, end: 180} ] ──┼──▶ Chunk 1: [In the early morning,]
[ {word: "early",  start: 180, end: 400} ] ──┤    TimeRange: [0ms, 850ms]
[ {word: "morning",start: 400, end: 850} ] ──┘    TriggerVisualHighlight: at -100ms (-100ms ~ 750ms)
```

1. **轻量级方案：Web Speech API (`window.speechSynthesis`)**：
   - 机制：监听 `SpeechSynthesisUtterance` 的 `onboundary` 事件（`event.name === 'word'`），通过 `event.charIndex` 与 `event.charLength` 获取当前播放字符位置。
   - **浏览器兼容性陷阱与工程防护**：
     - *Chrome/Blink 垃圾回收 Bug*：长文本发音超过 15 秒常出现静默中断；必须通过心跳定时器或分段投递（chunk-by-chunk utterance queue）规避。
     - *charIndex 偏移漂移*：部分操作系统（如 Windows SAPI5 或 Linux espeak）的 `charIndex` 不包含空格或标点；必须使用纯字符累加器重新校验。
2. **高保真方案：神经 TTS WebSocket / REST 词级时间戳（Edge TTS / Azure Speech SDK）**：
   - 机制：服务端返回每词的绝对音频偏移（`AudioOffset`，微秒级）与持续时间（`Duration`）。
   - **时间戳意群聚合算法（Chunk Timestamp Aggregator）**：
     - 将连续的单词级时间戳映射回 Chunkly 预先生成的 chunk 数组切片。
     - $\text{Chunk}_{\text{start}} = \text{FirstWord}.\text{AudioOffset}$
     - $\text{Chunk}_{\text{end}} = \text{LastWord}.\text{AudioOffset} + \text{LastWord}.\text{Duration}$
     - 将高亮定时器设定为 $\text{Chunk}_{\text{start}} - 100\text{ ms}$，实现像素级流畅的卡拉 OK 意群跟随。

#### 4.3.5 影子跟读（Shadowing）的认知心理学分阶训练架构（Kadota & Tamai 模型）

应用语言学家门田修平（Shuhei Kadota, 2007, 2019）与玉井健（Ken Tamai, 1997, 2005）的实证研究表明，**影子跟读（Shadowing）**是打通二语语音回路、实现语言自动化（Automatization）的最强干预手段。跟读训练迫使学习者在 250–500 ms 的极短时延内完成声学感知、发音器官运动映射与意义理解。

Chunkly 的影子跟读功能应划分为三个认知阶梯：

```
       [ 阶段 1: 意群驻留复述 (Paused Shadowing) ]
       音频播放 1 个 Chunk ──▶ 动态静音 1.2x ──▶ 学习者从容复述 (释放工作记忆负荷)
                           │
                           ▼
       [ 阶段 2: 视觉领航同步跟读 (Visual-cued Synchronous Shadowing) ]
       高亮视觉提前 100ms 伴随 ──▶ 语流低时延持续输出 (250-400ms 声学追随)
                           │
                           ▼
       [ 阶段 3: 盲听声学跟读 (Blind Acoustic Shadowing) ]
       文本隐退 ──▶ 纯依靠听觉意群边界与音高滑移感知跟读 (实现神经自动化与彻底内化)
```

1. **阶段 1：意群驻留复述（Phrase-by-Phrase Paused Shadowing）——针对初中级学习者**：
   - **交互逻辑**：TTS 播放完一个完整意群后，播放器自动暂停，动态计算静音插入时长：
     $$\text{SilenceDuration} = \text{ChunkAudioDuration} \times 1.2 + 200\text{ ms}$$
   - **认知价值**：充分利用 Baddeley 语音回路中 1.5–2 秒的声学存储期，让学习者在无认知焦虑的状态下完成完整意群的韵律摹仿，建立发音肌肉记忆。
2. **阶段 2：视觉领航同步跟读（Visual-cued Synchronous Shadowing）——针对中高级进阶**：
   - **交互逻辑**：连续不间断朗读，Chunkly 视觉高亮以 100 ms 提前量动态引导视线，同时屏幕提供波形节奏节拍器（Prosodic Metronome），学习者落后声学信号 1–2 个单词（约 250–400 ms）进行低时延跟读。
   - **认知价值**：眼-耳-口三通道神经高速协同，强迫注意力从「单字拼读」转向「意群包络捕获」。
3. **阶段 3：盲听声学跟读（Blind Acoustic Shadowing）——终极脱水内化**：
   - **交互逻辑**：隐藏原文文本与意群标记，仅提供纯音频；跟读完毕后，再展开 Chunkly 意群对照视图，进行错漏切分复盘。
   - **认知价值**：彻底断开对视觉文字拐杖的依赖，检验并确立纯粹基于听觉意群边界线索的自然理解力。

---

## 5. 权威参考文献 (References)

以下文献构成了本报告与 Chunkly 理论基础的核心学术引用源，涵盖应用语言学、认知心理学、眼动研究、二语习得与语音教学领域：

1. **Baddeley, A. D., & Hitch, G. (1974)**. Working memory. *Psychology of Learning and Motivation*, 8, 47–89.
2. **Baddeley, A. D. (1986)**. *Working Memory*. Oxford: Oxford University Press.
3. **Baddeley, A. D. (2000)**. The episodic buffer: A new component of working memory? *Trends in Cognitive Sciences*, 4(11), 417–423.
4. **Beckman, M. E., & Pierrehumbert, J. B. (1986)**. Intonational structure in Japanese and English. *Phonology Yearbook*, 3, 255–309.
5. **Buswell, G. T. (1920)**. *An Experimental Study of the Eye-Voice Span in Reading*. Supplementary Educational Monographs, No. 17. Chicago: Department of Education, University of Chicago.
6. **Cauldwell, R. (2013)**. *Phonology for Listening: Twin Ponds Press*. Birmingham: Twin Ponds Press.
7. **Celce-Murcia, M., Brinton, D. M., & Goodwin, J. M. (2010)**. *Teaching Pronunciation: A Course Book and Reference Guide* (2nd ed.). Cambridge: Cambridge University Press.
8. **Cowan, N. (2001)**. The magical number 4 in short-term memory: A reconsideration of mental storage capacity. *Behavioral and Brain Sciences*, 24(1), 87–114.
9. **Cutler, A., & Norris, D. (1988)**. The role of strong syllables in segmentation for lexical access. *Journal of Experimental Psychology: Human Perception and Performance*, 14(1), 113–121.
10. **Daneman, M., & Carpenter, P. A. (1980)**. Individual differences in working memory and reading. *Journal of Verbal Learning and Verbal Behavior*, 19(4), 450–466.
11. **Dauer, R. M. (1983)**. Stress-timing and syllable-timing reanalyzed. *Journal of Phonetics*, 11(1), 51–62.
12. **Ellis, N. C. (2001)**. Memory for language. In P. Robinson (Ed.), *Cognition and Second Language Instruction* (pp. 33–68). Cambridge: Cambridge University Press.
13. **Ellis, N. C. (2002)**. Frequency effects in language processing: A review with implications for theories of implicit and explicit language acquisition. *Studies in Second Language Acquisition*, 24(2), 143–188.
14. **Ellis, N. C. (2006)**. Language acquisition as rational contingency learning. *Applied Linguistics*, 27(1), 1–24.
15. **Field, J. (2003)**. Promoting perception: Lexical segmentation in L2 listening. *ELT Journal*, 57(4), 325–334.
16. **Field, J. (2008)**. *Listening in the Language Classroom*. Cambridge: Cambridge University Press.
17. **Fodor, J. D. (1998)**. Learning to parse? *Journal of Psycholinguistic Research*, 27(2), 285–319.
18. **Fodor, J. D. (2002)**. Psycholinguistics cannot escape prosody. In *Proceedings of the 1st International Conference on Speech Prosody* (pp. 83–88). Aix-en-Provence.
19. **Gilbert, J. B. (1984, 1993, 2005, 2012)**. *Clear Speech: Pronunciation and Listening Comprehension in North American English* (4th ed.). New York: Cambridge University Press.
20. **Kadota, S. (2007)**. *Shadowing as a Mental Practice: The Science of English Speech Automatization*. Tokyo: CosmoPier.
21. **Kadota, S. (2019)**. *Shadowing as a Learner-Centered Approach to Developing L2 Spoken Fluency*. New York: Routledge.
22. **Kuhn, M. R., & Stahl, S. A. (2003)**. Fluency: A review of developmental and remedial practices. *Journal of Educational Psychology*, 95(1), 3–21.
23. **Levin, H., & Kaplan, E. L. (1970)**. Grammatical structure and reading. In H. Levin & J. P. Williams (Eds.), *Basic Studies on Reading* (pp. 119–133). New York: Basic Books.
24. **Lewis, M. (1993)**. *The Lexical Approach: The State of ELT and a Way Forward*. Hove: Language Teaching Publications.
25. **Lewis, M. (1997)**. *Implementing the Lexical Approach: Putting Theory into Practice*. Hove: Language Teaching Publications.
26. **Miller, G. A. (1956)**. The magical number seven, plus or minus two: Some limits on our capacity for processing information. *Psychological Review*, 63(2), 81–97.
27. **O'Shea, L. J., & Sindelar, P. T. (1983)**. The effects of segmenting written discourse on the reading comprehension of low- and high-achieving readers. *Reading Research Quarterly*, 18(4), 458–465.
28. **Pierrehumbert, J. B. (1980)**. *The Phonology and Phonetics of English Intonation* (Doctoral dissertation). Massachusetts Institute of Technology. Distributed by Indiana University Linguistics Club.
29. **Rasinski, T. V. (1990)**. The effects of cued phrase boundaries on reading speed and comprehension. *Journal of Reading Behavior*, 22(3), 219–228.
30. **Rasinski, T. V. (2000)**. Speed does matter in reading, but… *The Reading Teacher*, 54(2), 146–151.
31. **Rasinski, T. V. (2004)**. *Assessing Reading Fluency*. Pacific Resources for Education and Learning (PREL).
32. **Rasinski, T. V. (2006)**. Reading fluency instruction: Moving beyond accuracy, automaticity, and prosody. *The Reading Teacher*, 59(7), 704–706.
33. **Rasinski, T. V. (2010)**. *The Fluent Reader: Oral & Silent Reading Strategies for Building Fluency, Word Recognition & Comprehension* (2nd ed.). New York: Scholastic.
34. **Rasinski, T. V., Yildirim, K., & Nagel, D. (2017)**. Building fluency through the phrased text strategy. *The Reading Teacher*, 70(6), 719–724.
35. **Rayner, K. (1998)**. Eye movements in reading and information processing: 20 years of research. *Psychological Bulletin*, 124(3), 372–422.
36. **Rayner, K. (2009)**. The 35th Sir Frederick Bartlett Lecture: Eye movements and attention in reading, scene perception, and visual search. *Quarterly Journal of Experimental Psychology*, 62(8), 1457–1506.
37. **Rayner, K., & Pollatsek, A. (1989)**. *The Psychology of Reading*. Englewood Cliffs, NJ: Prentice-Hall.
38. **Rayner, K., Pollatsek, A., Ashby, J., & Clifton, C. Jr. (2012)**. *Psychology of Reading* (2nd ed.). New York: Psychology Press.
39. **Roach, P. (1982)**. On the distinction between 'stress-timed' and 'syllable-timed' languages. In D. Crystal (Ed.), *Linguistic Controversies* (pp. 73–79). London: Edward Arnold.
40. **Simon, H. A. (1974)**. How big is a chunk? *Science*, 183(4124), 482–488.
41. **Sinclair, J. (1991)**. *Corpus, Concordance, Collocation*. Oxford: Oxford University Press.
42. **Stevens, K. V. (1981)**. Chunking material as an aid to reading comprehension. *Journal of Reading*, 25(2), 126–129.
43. **Sweller, J. (1988)**. Cognitive load during problem solving: Effects on learning. *Cognitive Science*, 12(2), 257–285.
44. **Sweller, J., Ayres, P., & Kalyuga, S. (2011)**. *Cognitive Load Theory*. New York: Springer Science & Business Media.
45. **Tamai, K. (1997)**. How shadowing training improves listening comprehension skills. *Language Laboratory*, 34, 105–116.
46. **Tamai, K. (2005)**. *The Effectiveness of Shadowing in L2 Listening Instruction*. Tokyo: Kazama Shobo.
47. **Wray, A. (2002)**. *Formulaic Language and the Lexicon*. Cambridge: Cambridge University Press.
