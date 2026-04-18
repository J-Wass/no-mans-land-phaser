Todo:
- ui for diplomacy
- speed toggle on ticks
- use fake city and nation names, not real things like rome, perisia etc. make it an easy to edit json or txt file
- randomize the starting tiles
- add single player scenario mode, where you play against a set nation with set resources
- units need certain materials to be built.
- when a unit tries to attack, they need to go through every single tile. They cant just invade and move straight into a city.
- clean up the ui. Make all the text and icons bigger and support scrolling if the page is too big. we want to see more details, like unit stats, cost, requirements, etc. Make them big, obvious, and standardized
- make the vision UX a bit better. We should know the difference between: unknown (total black), fog of war (darker, can see tile but no updates), edge of fog (lighter grey, we see updates but only light/heavy), vision (full sight)
- add levels to buildings. for instance, walls can go up to lvl 5, adding dmg and hp to the city. a City with walls lvl 2 gets range of 2. walls of lvl 4 gets range of 3.
- start cities with a bit less territory. There should be more neutral territory to explore and conquer. 
- making outposts should cost gold, material, and food, make it clear when you select
- make it so units have a startup gold cost and then an ongoing material and food cost. 
- instead of showing ticks, show "days". Make it so a day lasts roughly 10s. 
- mana has an effect on units, like iron/bronze/fire glass.
Resources	First resource advantage	Further advantage
Water Mana	Waterwalking, Heal over time	Heal+ over time
Fire Mana	Damage+	Damage++
Lightning Mana	Speed+	Speed++
Earth Mana	Mountainwalking, Max HP+	Max HP++
Air Mana	Vision+	Vision++
Shadow Mana	2x withdraw chance, Hides 1 extra tile from enemy	Hide+
Copper	Allows army to use Bronze weapons.	Gold+
Iron	Allows army to use Iron and Steel weapons.	Gold+
Fire Glass	Allows army to use Fire Glass weapons.	Gold+
Silver	Gold+	Gold++
Gold	Gold++	Gold+++
- unit pathfinding avoids going through enemy territory if possible