Todo:
- units spawn with names like 101st infantry battalion, 102nd scouts corp, etc. They start at 101 and increase as spawned.
- units have xp, upon being in fights they gain. retreat = 1xp, enemy retreat = 2xp, kill = 3xp. A unit can level up 2 times: Recruit, Veteran, and Elite. Once units become elite, their group name changes. 
Name	Upkeep	Hp	Damage	Ranged Dmg	Range	Armor	Speed	Vision	Matchups	Terrain	Materials Used	Tech Needed	Buildings Needed	Group	Experienced Group
Infantry	Food, Raw Material	10	10	0	1	light	2	1			Stone, Bronze, Iron, Steel, Fire Glass	-	Barracks 1	Battalion	Legion
Scout	Food, Raw Material	10	2	0	1	light	3	2			Stone, Bronze, Iron, Steel	-	Barracks 1	Regiment	Corp
Heavy Infantry	Food, Raw Material+	25	20	0	1	heavy	1	1	Cavalry+, Light+	Forest-	Iron, Steel, Fire Glass	Iron Working	Barracks 2, Workshop 2	Battalion	Legion
Cavalry	Food+, Raw Material+	25	40	0	1	heavy	3	1	Light+	Forest-	Iron, Steel, Fire Glass	Iron Working, Animal Domestication	Barracks 3, Workshop 2	Squadron	Wing
Longbowman	Food, Raw Material	10	10	12	3	light	2	1		Hills+	Stone, Bronze, Iron, Steel, Fire Glass	Hunting	Barracks 1, Public Green 1	Regiment	Corp
Crossbowman	Food, Raw Material+	15	10	15	2	heavy	1	1	Heavy+	Hills+	Iron, Steel, Fire Glass	Mechanization	Barracks 3, Public Green 2, Workshop 1	Regiment	Corp
Catapult	Food, Raw Material+	20	15	25	2	heavy	1	1	Cities+, Light-	Hills+, Forest-	Iron, Steel, Fire Glass	Iron Working, The Wheel	Barracks 4, Workshop 2	Battery	Train
Trebuchet	Food, Raw Material++	25	25	50	3	heavy	1	1	Cities+, Light-	Hills+, Forest-	Steel, Fire Glass	Mechanization, The Wheel, Steel Working	Barracks 5, Workshop 3	Battery	Train

- implement vision. There are several layers to it:
1. the map starts black except for your territory + 2 tiles surrounding. As you explore, the tiles go from black to discovered. Each unit has 1 block of vision around them (except scouts that have 2). Within vision, they see everything. 1 tile outside of a unit's vision, the unit sees basic details of any unit, such as "unidentified heavy contact". Mana like air mana gives all units +1 vision. Mana like shadow mana means units lose 1 vision (down to 0) in reference to the shadow unit. If a unit has 0 vision of the shadow unit, they will only see unidentified contact until actually in battle.

- fix retreat and withdraw. Right now, the retreating team is immediately attacked again and killed. They should be able to hop 2 tiles away after a retreat. Reiterate that a retreat happens when the unit successfully retreats, meaning they gave up all the land by using the retreat and fallback  options. If a unit is going to die, they die even if retreating. Only way off is through land. Also show land meter above health bars of the fighting forces.