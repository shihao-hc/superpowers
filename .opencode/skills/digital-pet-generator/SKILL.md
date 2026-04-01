---
name: digital-pet-generator
description: Use when creating ASCII art digital companions that are deterministically generated from user identifiers, with customizable species, appearances, and animated frames
---

# 数字宠物生成器 - 根据用户ID生成ASCII艺术宠物

> 基于 Claude Code BUDDY 系统的逆向工程，适用于任何平台的数字宠物生成

## 🎯 功能概述

- **确定性生成**：相同用户ID产生相同宠物
- **多物种支持**：18种独特ASCII艺术
- **动画支持**：3帧循环动画
- **可自定义**：名字、性格、皮肤

---

## 🐾 核心代码实现

### PRNG 模块

```python
class DeterministicRNG:
    """基于种子的一致性随机数生成器"""
    
    def __init__(self, seed: int):
        self.seed = seed & 0xFFFFFFFF
    
    def next(self) -> int:
        """生成下一个随机数"""
        self.seed = (self.seed + 0x6D2B79F5) & 0xFFFFFFFF
        t = self.seed
        t = (t ^ (t >> 15)) & 0xFFFFFFFF
        t = (t + (t ^ (t >> 7))) & 0xFFFFFFFF
        t = (t ^ (t >> 14)) & 0xFFFFFFFF
        return ((t + (t ^ (t >> 12))) ^ 0x5bd1e995) & 0xFFFFFFFF
    
    def range(self, min_val: int, max_val: int) -> int:
        """生成范围内的随机数"""
        return min_val + (self.next() % (max_val - min_val + 1))
    
    def choice(self, options: list) -> any:
        """从列表中随机选择"""
        return options[self.next() % len(options)]
    
    def chance(self, percent: int) -> bool:
        """percent% 概率返回 True"""
        return self.next() % 100 < percent


def hash_user_id(user_id: str, salt: str = "pet-v1") -> int:
    """将用户ID转换为数值种子"""
    h = 0x811c9dc5
    for c in (user_id + salt).encode('utf-8'):
        h ^= c
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h
```

### ASCII 艺术模板

```python
class ASCIIPets:
    """18种ASCII宠物艺术模板"""
    
    DUCK = [
        """  __      
 <(· )___  
  (  ._>   
   `--´    """,
        """  __      
 <(· )___  
  (  ._>   
   `--´~   """,
        """  __      
 <(· )___  
  (  .__>  
   `--´    """
    ]
    
    CAT = [
        """  /^\\  
 <  ·  ·  > 
(   ~~   )
 `-vvvv-´""",
        """  /^\\  
 <  ·  ·  > 
(        )
 `-vvvv-´""",
        """ ~    ~  
  /^\\  
 <  ·  ·  > 
(   ~~   )
 `-vvvv-´"""
    ]
    
    GHOST = [
        """}~(_____)~{
}~(· .. ·)~{
  ( .--. )  
 (\_/  \_)""",
        """~}(_____){~
~}(· .. ·)~{
  ( .--. )  
 (\_/  \_)""",
        """}~(_____)~{
}~(· .. ·)~{
  (  --  )  
 ~\\_/  \\_~"""
    ]
    
    # ... 更多物种
```

### 宠物生成器

```python
@dataclass
class Pet:
    name: str
    species: str
    rarity: str
    eyes: str
    hat: str
    shiny: bool
    frames: list  # 3帧动画
    personality: str


class DigitalPetGenerator:
    """数字宠物生成器"""
    
    SPECIES = ["duck", "goose", "blob", "cat", "dragon", "octopus", 
               "owl", "penguin", "turtle", "snail", "ghost", "axolotl",
               "cactus", "cactus", "robot", "rabbit", "mushroom", "chonk"]
    
    EYES = ["·", "✦", "×", "◉", "@", "°"]
    
    HATS = ["none", "crown", "tophat", "propeller", "halo", 
            "wizard", "beanie", "tinyduck"]
    
    RARITY_CONFIG = {
        "common": {"floor": 5, "peak": 84, "weight": 40},
        "uncommon": {"floor": 15, "peak": 94, "weight": 25},
        "rare": {"floor": 25, "peak": 100, "weight": 20},
        "epic": {"floor": 35, "peak": 100, "weight": 10},
        "legendary": {"floor": 50, "peak": 100, "weight": 5},
    }
    
    def generate(self, user_id: str) -> Pet:
        """根据用户ID生成唯一宠物"""
        seed = hash_user_id(user_id)
        rng = DeterministicRNG(seed)
        
        # 1. 稀有度
        rarity = self._roll_rarity(rng)
        
        # 2. 物种
        species = rng.choice(self.SPECIES)
        
        # 3. 眼睛
        eyes = rng.choice(self.EYES)
        
        # 4. 帽子
        hat = "none" if rarity == "common" else rng.choice(self.HATS)
        
        # 5. 闪亮
        shiny = rng.chance(1)
        
        # 6. 获取帧
        frames = self._get_frames(species)
        
        # 7. 名字和性格（需要LLM）
        name, personality = self._generate_personality(
            species, rarity, shiny
        )
        
        return Pet(
            name=name,
            species=species,
            rarity=rarity,
            eyes=eyes,
            hat=hat,
            shiny=shiny,
            frames=frames,
            personality=personality
        )
    
    def _roll_rarity(self, rng: DeterministicRNG) -> str:
        roll = rng.range(0, 99)
        if roll < 40: return "common"
        if roll < 65: return "uncommon"
        if roll < 85: return "rare"
        if roll < 95: return "epic"
        return "legendary"
    
    def _get_frames(self, species: str) -> list:
        return getattr(ASCIIPets, species.upper(), ASCIIPets.DUCK)
```

---

## 🎬 动画实现

```python
import time
import os


class PetAnimator:
    """宠物动画控制器"""
    
    def __init__(self, pet: Pet, interval: float = 1.0):
        self.pet = pet
        self.interval = interval
        self.frame_index = 0
    
    def render(self) -> str:
        """渲染当前帧"""
        frame = self.pet.frames[self.frame_index]
        return self._apply_eyes(frame, self.pet.eyes)
    
    def _apply_eyes(self, frame: str, eyes: str) -> str:
        """替换眼睛"""
        return frame.replace("{E}", eyes)
    
    def next_frame(self):
        """切换到下一帧"""
        self.frame_index = (self.frame_index + 1) % len(self.pet.frames)
    
    def animate(self, duration: int = 10):
        """动画循环播放"""
        for _ in range(duration):
            print("\033[2J\033[H")  # 清屏
            print(self.render())
            time.sleep(self.interval)
            self.next_frame()


def display_pet_in_terminal(user_id: str, animate: bool = True):
    """终端中显示宠物"""
    generator = DigitalPetGenerator()
    pet = generator.generate(user_id)
    
    print(f"╔══════════════════════════════╗")
    print(f"║ {pet.name:^28} ║")
    print(f"║ {pet.rarity:^12} {pet.species:^14} ║")
    print(f"╠══════════════════════════════╣")
    
    for i, frame in enumerate(pet.frames):
        prefix = "▶ " if i == 0 else "  "
        print(f"{prefix}{frame}")
    
    print(f"╠══════════════════════════════╣")
    print(f"║ {pet.personality:^28} ║")
    print(f"╚══════════════════════════════╝")
```

---

## 🌐 API 服务示例

```python
from fastapi import FastAPI

app = FastAPI()


@app.get("/pet/{user_id}")
async def get_pet(user_id: str):
    """获取用户宠物"""
    generator = DigitalPetGenerator()
    pet = generator.generate(user_id)
    
    return {
        "name": pet.name,
        "species": pet.species,
        "rarity": pet.rarity,
        "eyes": pet.eyes,
        "hat": pet.hat,
        "shiny": pet.shiny,
        "art": pet.frames,
        "personality": pet.personality
    }


@app.get("/pet/{user_id}/frame/{frame_num}")
async def get_pet_frame(user_id: str, frame_num: int):
    """获取指定帧"""
    generator = DigitalPetGenerator()
    pet = generator.generate(user_id)
    
    return {
        "frame": pet.frames[frame_num % len(pet.frames)],
        "frame_index": frame_num % len(pet.frames)
    }
```

---

## 🎮 使用示例

```bash
# 命令行使用
python pet_generator.py --user-id user123

# 输出:
# ╔══════════════════════════════════╗
# ║           Quackster             ║
# ║        LEGENDARY duck           ║
# ╠══════════════════════════════════╣
#   __      
#  <(✦ )___  
#   (  ._>   
#    `--´    
# ╠══════════════════════════════════╣
# ║  Insists on quacking before     ║
# ║  every function call            ║
# ╚══════════════════════════════════╝
```

---

## 🔧 扩展选项

### 添加新物种

```python
# 在 ASCIIPets 类中添加新模板
NEW_SPECIES = [
    """  __
 /  \
| (·) |
  \__/""",
    """  __
 /  \
| (·) |
  \__/~""",
    """  __
 /  \
| (·) |
  \__/"""
]
```

### 添加反应系统

```python
def get_pet_reaction(pet: Pet, context: str) -> str:
    """根据上下文生成宠物反应"""
    reactions = {
        "debugging": ["🦆💭 \"Try logging it\"", "🦆💭 \"Have you tried turning it off and on?\"", "🦆💭 \"It works on my machine\""],
        "error": ["🦆😱 \"QUACK!\"", "🦆💨 \"Running away!\"", "🦆😤 \"That's not a bug, it's a feature!\""],
        "success": ["🦆🎉 \"QUACK QUACK!\"", "🦆💃 \"Party time!\"", "🦆😊 \"Good job!\""],
    }
    
    # 基于属性决定反应风格
    if pet.stats["snark"] > 70:
        category = "snark"
    else:
        category = "default"
    
    return random.choice(reactions.get(category, reactions["default"]))
```

---

## 📚 参考

- [Claude Code BUDDY 逆向分析](https://variety.is/posts/claude-code-buddies/)
- [buddy-card 生成器](https://github.com/dyz2102/buddy-card)
