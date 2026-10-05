# F4WE Discord Activity

Az Android alkalmazás a Discord Social SDK segítségével megjeleníti az éppen hallgatott zenét a felhasználó Discord Activity részében.

## Megjelenő adatok

- Activity: `Playing F4WE`, alatta az aktuális zene és előadó
- Zene címe
- Előadó
- Eltelt és hátralévő idő
- `Try F4WE` gomb, amely a `https://f4we.xyz/` oldalra nyit

Zeneváltáskor az activity automatikusan frissül. Szüneteltetéskor, kijelentkezéskor vagy a lejátszási sor végén törlődik.

## Tesztelési feltételek

1. A telefonon legyen telepítve a friss Discord alkalmazás.
2. A Discordban legyen bejelentkezve a tesztelő.
3. Ehhez a funkcióhoz új natív Android build/APK szükséges; a korábbi APK nem tartalmazza a Discord SDK-t.
4. Indítsd el a Discordot, majd a F4WE-ben kezdj el lejátszani egy zenét.
5. Az activityt célszerű egy másik Discord-fiókból is ellenőrizni. A saját activity gombját a Discord nem minden felületen mutatja meg a saját felhasználónak.

Discord Application ID: `1550247896803446874`

## Fontos

- A Discord Activity telefonon futó natív funkció, ezért nem igényel új Railway környezeti változót.
- Ha nincs telepítve vagy nincs bejelentkezve a Discord, a zenelejátszás akkor is zavartalanul működik; csak az activity nem jelenik meg.
- A Discord Social SDK AAR és a hozzá tartozó licencértesítő az `apps/mobile/android/app/libs` mappában található.
