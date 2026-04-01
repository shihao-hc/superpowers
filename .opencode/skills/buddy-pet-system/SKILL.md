---
name: buddy-pet-system
description: Use when implementing a Tamagotchi-style companion system where virtual pets are deterministically generated from user identifiers, with species, rarity, attributes, and cosmetic customization
---

# BUDDY 宠物系统 - Claude Code 逆向工程实现

> 基于 Claude Code 泄露源码中 BUDDY 系统的完整逆向分析

## 📊 系统概览

| 维度 | 数值 |
|------|------|
| 物种数 | 18 种 |
| 眼睛样式 | 6 种 |
| 帽子样式 | 8 种 |
| 稀有度 | 5 级 |
| 属性 | 5 种 |
| 闪亮概率 | 1% |
| 组合数 | 7,128 种 |

---

## 🎯 核心概念

### 确定性生成
- 用户 ID + SALT → hash → mulberry32 PRNG → 确定宠物
- 相同 ID 永远生成相同宠物
- 可暴力破解（4.29 billion 状态，秒级穷举）

### 稀有度机制
| 稀有度 | 属性下限 | 最高属性 | 帽子 |
|--------|----------|----------|------|
| common | 5 | 55-84 | ❌ |
| uncommon | 15 | 65-94 | ✅ |
| rare | 25 | 75-100 | ✅ |
| epic | 35 | 85-100 | ✅ |
| legendary | 50 | 100 | ✅ |

---

## 🐾 18 种物种 ASCII 艺术

### duck (鸭子)
```
  __      
 <(· )___  
  (  ._>   
   `--´    

  __      
 <(· )___  
  (  ._>   
   `--´~   

  __      
 <(· )___  
  (  .__>  
   `--´    
```

### goose (鹅)
```
   .----.   
  ( ·  · )  
  (      )  
   `----´   

 .------.  
(  ·  ·  ) 
(        ) 
 `------´  

   .--.    
  (·  ·)   
  (    )   
   `--´    
```

### blob (史莱姆)
```
 /\_/\
( ·   ·)
(  ω  )
(")_(")

 /\_/\
( ·   ·)
(  ω  )
(")_(")~

 /\-/\
( ·   ·)
(  ω  )
(")_(")
```

### cat (猫咪)
```
  /^\
 <  ·  ·  > 
(   ~~   )
 `-vvvv-´

  /^\
 <  ·  ·  > 
(        )
 `-vvvv-´

 ~    ~  
  /^\
 <  ·  ·  > 
(   ~~   )
 `-vvvv-´
```

### dragon (龙)
```
   .----.   
  ( ·  · )  
 (_______)  
/\/\/\/\

   .----.   
  ( ·  · )  
 (_______)  
\/\/\/\/

     o      
   .----.   
  ( ·  · )  
 (_______)  
/\/\/\/\
```

### octopus (章鱼)
```
 /\  /\   
((·)(·))  
(  ><  )  
 `----´   

 /\  /\   
((·)(·))  
(  ><  )  
 .----.   

 /\  /\   
((·)(-))  
(  ><  )  
 `----´   
```

### owl (猫头鹰)
```
 .---.     
(·>·)     
/(   )\   
 `---´     

 .---.     
(·>·)     
|(   )|   
 `---´     

 .---.     
(·>·)     
/(   )\   
 `---´     
  ~ ~      
```

### penguin (企鹅)
```
_,--._   
( ·  · )  
/\[_____]\ 
``    ``  

_,--._   
( ·  · )  
/\[_____]\ 
``  ``   

_,--._   
( ·  · )  
/\[======]\ 
``    ``  
```

### turtle (乌龟)
```
  ·    .--.  
   \  ( @ )  
    \_`--´   
  ~~~~~~~   

  ·   .--.  
  |  ( @ )  
   \_`--´   
 ~~~~~~~   

  ·    .--.  
   \  ( @ ) 
   \_`--´   
  ~~~~~~   
```

### snail (蜗牛)
```
   .----.   
 / ·  · \  
 |      |  
 ~`~`~`~  

   .----.   
 / ·  · \  
 |      |  
 `~`~~`~`  

   ~  ~    
   .----.   
 / ·  · \  
 |      |  
 ~~`~~`~~  
```

### ghost (幽灵)
```
}~(_____)~{
}~(· .. ·)~{
  ( .--. )  
 (\_/  \_)

~}(_____){~
~}(· .. ·)~{
  ( .--. )  
 (\_/  \_)

}~(_____)~{
}~(· .. ·)~{
  (  --  )  
 ~\_/  \_~  
```

### axolotl (蝾螈)
```
 n_____n  
 ( ·    · ) 
 (   oo   ) 
 `------´  

 n_____n  
 ( ·    · ) 
 (   Oo   ) 
 `------´  

 ~  ~    
 u_____n  
 ( ·    · ) 
 (   oo   ) 
 `------´  
```

### capybara (水豚)
```
 n  ____  n 
| |·  ·| | 
|_|    |_| 
  |    |   

   ____    
 n |·  ·| n 
 |_|    |_| 
  |    |   

 n        n 
 |  ____  | 
 | |·  ·| | 
 |_|    |_| 
  |    |   
```

### cactus (仙人掌)
```
 .[||].   
[ ·  · ]  
[ ==== ]  
`------´  

 .[||].   
[ ·  · ]  
[ -==- ]  
`------´  

   *      
 .[||].   
[ ·  · ]  
[ ==== ]  
`------´  
```

### robot (机器人)
```
(\__/)   
( ·  · )  
=(  ..  )= 
(")__(")

(|__/)   
( ·  · )  
=(  ..  )= 
(")__(")

(\__/)   
( ·  · )  
=( .  . )= 
(")__(")
```

### rabbit (兔子)
```
 .-o-OO-o-. 
(_________)
  |·  ·|   
  |____|   

 .-O-oo-O-. 
(_________)
  |·  ·|   
  |____|   

 . o  .   
 .-o-OO-o-. 
(_________)
  |·  ·|   
  |____|   
```

### mushroom (蘑菇)
```
 /\    /\  
 ( ·    · ) 
 (   ..   ) 
 `------´  

 /\    /|  
 ( ·    · ) 
 (   ..   ) 
 `------´  

 /\    /\  
 ( ·    · ) 
 (   ..   ) 
 `------´~ 
```

### chonk (胖达)
```
  __      
<(· )__   
 (  ._>   
  `--´    

  __      
<(· )__   
 (  ._>   
  `--´~   

  __      
<(· )__   
 (  .__>  
  `--´    
```

---

## 👀 眼睛样式

| 样式 | 字符 | 描述 |
|------|------|------|
| default | `·` | 普通，平静 |
| sparkly | `✦` | 闪亮，兴奋 |
| dizzy | `×` | 眩晕，调皮 |
| wide | `◉` | 大眼，警觉 |
| digital | `@` | 数字，机械 |
| surprised | `°` | 惊讶，空洞 |

---

## 🎩 帽子样式

| 样式 | ASCII | 说明 |
|------|-------|------|
| none | (无) | Common 专属 |
| crown | `\^^^/` | 帝王 |
| tophat | `[___]` | 绅士 |
| propeller | `-+-` | 童趣 |
| halo | `(   )` | 天使 |
| wizard | `/^` | 魔法 |
| beanie | `(___)` | 舒适 |
| tinyduck | `,>` | 鸭子 |

---

## 📊 属性系统

```python
STATS = ["debugging", "patience", "chaos", "wisdom", "snark"]

def roll_stats(rarity_floor: int, rarity_peak: int) -> dict:
    stats = {}
    for stat in STATS:
        if stat == peak_stat:
            # 峰值属性
            stats[stat] = random.randint(rarity_floor + 50, rarity_floor + 79)
        elif stat == dump_stat:
            # 垃圾属性
            stats[stat] = random.randint(rarity_floor - 10, rarity_floor + 4)
        else:
            stats[stat] = random.randint(rarity_floor, rarity_peak)
    return stats
```

---

## 🔧 核心实现

### PRNG (mulberry32)

```python
def mulberry32(seed: int):
    """32位确定性随机数生成器"""
    def rand():
        nonlocal seed
        seed += 0x6D2B79F5
        t = seed
        t = (t ^ (t >> 15)) & 0xFFFFFFFF
        t = (t + (t ^ (t >> 7))) & 0xFFFFFFFF
        t = (t ^ (t >> 14)) & 0xFFFFFFFF
        return ((t + (t ^ (t >> 12))) ^ 0x5bd1e995) & 0xFFFFFFFF
    return rand

def hash_string(s: str) -> int:
    """字符串哈希"""
    h = 0x811c9dc5
    for c in s.encode('utf-8'):
        h ^= c
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h
```

### 宠物生成

```python
SALT = "claude-code-buddy-v1"

def generate_buddy(user_id: str) -> dict:
    """根据用户ID生成确定性宠物"""
    key = user_id + SALT
    seed = hash_string(key)
    rng = mulberry32(seed)
    
    # 1. 稀有度
    rarity_roll = rng() % 100
    if rarity_roll < 40:  # 40%
        rarity = "common"
    elif rarity_roll < 65:  # 25%
        rarity = "uncommon"
    elif rarity_roll < 85:  # 20%
        rarity = "rare"
    elif rarity_roll < 95:  # 10%
        rarity = "epic"
    else:  # 5%
        rarity = "legendary"
    
    # 2. 物种
    species = SPECIES[rng() % len(SPECIES)]
    
    # 3. 眼睛
    eyes = EYES[rng() % len(EYES)]
    
    # 4. 帽子 (common 没有)
    if rarity == "common":
        hat = "none"
    else:
        hat = HATS[rng() % len(HATS)]
    
    # 5. 闪亮 (1%)
    shiny = (rng() % 100) < 1
    
    # 6. 属性
    stats = roll_stats(rarity)
    
    return {
        "species": species,
        "rarity": rarity,
        "eyes": eyes,
        "hat": hat,
        "shiny": shiny,
        "stats": stats
    }
```

---

## 🎭 名字与性格生成

```python
INSPIRATION_WORDS = [
    "thunder", "biscuit", "void", "accordion", "moss", "velvet", "rust", 
    "pickle", "crumb", "whisper", "gravy", "frost", "ember", "soup",
    # ... 156 words total
]

DEFAULT_NAMES = ["Crumpet", "Soup", "Pickle", "Biscuit", "Moth", "Gravy"]

def generate_name_and_personality(buddy: dict) -> dict:
    """LLM生成名字和性格（需要外部调用）"""
    prompt = f"""
Generate a companion.
Rarity: {buddy['rarity'].upper()}
Species: {buddy['species']}
Stats: {buddy['stats']}
Inspiration words: {random.sample(INSPIRATION_WORDS, 4)}
{f"SHINY variant — extra special." if buddy['shiny'] else ""}
Make it memorable and distinct.
"""
    # 调用 LLM 生成
    return {"name": "Generated", "personality": "Generated"}
```

---

## 📁 配置文件格式

```json
{
  "oauthAccount": {
    "accountUuid": "461d455b-53f9-4f07-87c5-46dc0e2db302"
  },
  "companion": {
    "name": "Gristle",
    "personality": "Insists every variable name should rhyme with the one above it."
  }
}
```

---

## 🚀 应用场景

1. **CLI 伴侣** - 在终端提示符旁显示宠物
2. **用户识别** - 基于 ID 的唯一宠物
3. **Gamification** - 代码工作可视化
4. **情感交互** - 宠物对代码操作做出反应

---

## 📚 参考资源

- [Claude Code BUDDY 逆向分析](https://variety.is/posts/claude-code-buddies/)
- [Claude Code 源码](https://github.com/pengchengneo/Claude-Code)
