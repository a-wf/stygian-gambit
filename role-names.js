/* Original art-identity captions, in Chinese and English, by theme and role. */
(function () {
  "use strict";
  const roles = ["sovereign", "reaper", "juggernaut", "trickster", "wildrider", "skirmisher", "harrower", "fury"];
  const rows = {
    classic: ["冥府君主|Underworld Lord", "夜镰使者|Night Scythe", "石壁巨卫|Stonewall", "幽影戏法师|Shade Caster", "亡灵疾骑|Wraith Rider", "墓门斥候|Grave Scout", "魂链行刑官|Soulbinder", "复仇烈焰|Vengeful Flame"],
    galactic: ["黑武帝（银河黑甲将）|Armored star enforcer", "暗味达（暗甲宿将）|Dark-armored veteran", "钛坦星（重甲巨人）|Armored giant", "欧比宽（白刃导师）|Light-blade mentor", "波巴肥特（星际赏金客）|Interstellar bounty hunter", "风暴勇兵（白甲列兵）|White-armored soldier", "隔空牵引（隔空御物者）|Mind-guided mentor", "赤刃怒火（赤刃战士）|Red-bladed warrior"],
    superhero: ["星盾队长（星盾守卫）|Star-shield defender", "暗夜骑侠（夜行守护者）|Nighttime guardian", "钢铁侠客（装甲天才）|Armored genius", "编蛛侠客（夜行蛛丝侠）|Night web-slinger", "闪电侠影（极速英雄）|Super-speed hero", "街头守望（盲眼义警）|Blind street vigilante", "钩索编幅（夜行侦探）|Grappling night detective", "雷电巨汉（雷电巨力者）|Thunder-wielding hero"],
    justice: ["正义超人（披风强者）|Caped super-strong hero", "编幅侠影（夜行侦探）|Night detective", "海王潮使（海洋守护者）|Ocean guardian", "双面谜客（双面罪犯）|Two-faced criminal", "闪电极速（极速英雄）|Super-speed hero", "绿灯守望（绿甲守护者）|Green-armored guardian", "奇侠女卫（勇武女卫士）|Amazonian warrior", "复仇之火（复仇女卫）|Vengeful heroine"],
    shinobi: ["瞳术世家（瞳术忍者）|Eye-tech shinobi", "鬼猎夜行者（日纹刀客）|Sun-marked sword hunter", "铁甲忍卫（精英忍者）|Elite armored ninja", "狐影幻术师（狐灵寄宿者）|Fox-spirit host", "橙影疾足（橙衣忍者）|Orange-clad ninja", "竹影斥候（竹筒少女）|Bamboo-muzzled swordswoman", "锁镰缚魂者（锁刃猎鬼人）|Chain-blade demon hunter", "赤焰三刃（三刃剑客）|Three-blade swordsman"],
    spiritcourt: ["灵庭黑衣客（黑衣灵卫）|Black-robed spirit guard", "无常引魂使（灵刃剑士）|Spirit-blade swordsman", "镇殿石将（巨型守卫）|Giant guardian", "纸伞幻师（双刃伞剑客）|Twin-blade umbrella fighter", "风灯夜行客（疾步夜行者）|Swift-footed night scout", "引路童子（灵术术士）|Spirit-art practitioner", "缚灵司（缚术守卫）|Binding-art guardian", "幽火怨灵（白面幽灵）|White-masked wraith"],
    piratecrew: ["草帽船长（海盗船长）|Pirate captain", "黑旗剑客（三刃剑客）|Three-blade swordsman", "铁锚堡垒（铁甲船卫）|Iron-armored ship guard", "骗潮长鼻（长鼻神射手）|Long-nosed sharpshooter", "浪尖厨侠（黑衣船厨）|Black-suited ship's cook", "甲板突击手（航海女领航）|Female ship navigator", "钩缆拖拽手（遗迹学者）|Ancient-site scholar", "怒涛火灵（烈焰拳斗士）|Flame-fisted brawler"],
    wonderkingdom: ["冰铃女王（冰雪术士）|Ice-magic queen", "白兔夜访客（怀表旅人）|Pocket-watch wanderer", "南瓜铁卫（南瓜车卫兵）|Pumpkin-carriage guard", "红心诡术师（红衣牌局主）|Red-clad card-game ruler", "午夜疾行者（舞会旅人）|Midnight ball guest", "纸牌斥候（纸牌守卫）|Playing-card guard", "藤蔓牵引者（金发塔楼客）|Golden-haired tower dweller", "黑玫瑰怒焰（镜前女王）|Queen before a magic mirror"],
    olympian: ["宙斯（雷霆之王）|Zeus (thunder king)", "哈迪斯（冥界之王）|Hades (underworld king)", "赫拉克勒斯（狮皮巨力）|Heracles (lion-skinned hero)", "赫尔墨斯（神使）|Hermes (divine messenger)", "波塞冬（海马骑者）|Poseidon (sea-horse rider)", "雅典娜（持盾女神）|Athena (shield-bearing goddess)", "阿波罗（日耀弓神）|Apollo (sun-bright archer)", "阿瑞斯（战神）|Ares (god of war)"],
    pharaonic: ["阿蒙·拉（太阳主神）|Amun-Ra (sun god)", "伊西斯（魔法与守护女神）|Isis (magic and motherhood)", "奥西里斯／卜塔（冥王与创造神）|Osiris / Ptah (underworld and creator gods)", "托特（智慧与书写之神）|Thoth (wisdom and writing)", "荷鲁斯（天空之鹰）|Horus (falcon of the sky)", "阿努比斯／盖布（亡者引路者与大地神）|Anubis / Geb (dead-guide and earth god)", "塞赫麦特／哈索尔（狮首与日冠女神）|Sekhmet / Hathor (lioness and sun-crowned goddesses)", "塞特（风暴之神）|Seth (god of storms)"],
    celestial: ["地藏菩萨（九环锡杖）|Ksitigarbha (nine-ring staff)", "孙悟空（齐天大圣）|Sun Wukong (Monkey King)", "牛魔王（火焰山主）|Bull Demon King (mountain lord)", "二郎神（三目神将）|Erlang Shen (three-eyed deity)", "哪吒（风火轮）|Nezha (Wind-Fire Wheels)", "天兵天将（持戟神军）|Heavenly Halberdiers (celestial host)", "后羿（射日神弓）|Hou Yi (sun-shooting archer)", "铁扇公主（芭蕉扇）|Princess Iron Fan (banana-leaf fan)"],
    hyakki: ["滑头鬼（明：鬼族首领）／酒吞童子（暗：鬼王）|Nurarihyon (Light: yokai elder) / Shuten-Doji (Dark: oni king)", "九尾妖狐（明：灵扇狐妖）／杀戮鬼（暗：巨镰鬼）|Nine-Tailed Fox (Light: spirit-fan fox) / Slaughter Oni (Dark: scythe-wielding oni)", "饿者骷髅（巨骨骸灵）|Gashadokuro (giant skeleton)", "雪女（冰雪妖姬）|Yuki-Onna (snow spirit)", "大天狗／三眼乌天狗（鸦翼天狗）|Daitengu / Three-Eyed Crow Tengu (raven-winged)", "猫又（双尾鬼猫）|Nekomata (fork-tailed cat)", "酒吞童子／骨女（鬼王与骨女）|Shuten-Doji / Hone-Onna (oni king and bone woman)", "钟馗（斩妖判官）|Zhong Kui (demon-quelling judge)"],
  };
  const names = {};
  Object.keys(rows).forEach(theme => {
    names[theme] = {};
    rows[theme].forEach((pair, index) => {
      const [zh, en] = pair.split("|");
      names[theme][roles[index]] = { zh, en };
    });
  });
  window.SG = window.SG || {};
  window.SG.ROLE_NAMES = names;
})();
