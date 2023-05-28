# # Knotz Raven Mayhem

## Game Description:
Knotz Raven Mayhem is a canvas-based interactive game designed with JavaScript. In the game, you play as an unseen force with the power to create explosions and destroy ravens that fly across your screen. The objective is to score as many points as possible by clicking on ravens, which will detonate on impact and add to your score. 

## How to Play:
To play the game, simply click on the ravens as they fly across the screen. Each click will cause an explosion, destroying the raven and incrementing your score. Be quick! If a raven escapes off the left side of the screen, the game is over.

## Gameplay Elements:

### Ravens:
Ravens fly across the screen at varying speeds and directions. They are generated at random intervals and come in different sizes, with each one having a unique color code that enables collision detection when clicked. 

### Score:
Your score is updated every time a raven is destroyed. The score is displayed at the top left corner of the screen.

### Explosions:
Explosions occur when you click on a raven. They create a visually appealing effect and are accompanied by a sound for an immersive experience. 

### Game Over:
The game ends when a raven manages to escape off the left side of the screen. Your final score will be displayed at the center of the screen.

## Code Overview:

The game code utilizes multiple JavaScript classes to model different elements of the game such as `Raven`, `Explosion`, and `Particle`. The `animate` function controls the main game loop, where it updates the game state and re-renders the game view.

## Assets Needed:
This game uses the following assets:

1. raven.png: Image of a raven.
2. boom.png: Image for explosion effect.
3. boom.wav: Sound for explosion.

Remember to place these files in the same directory as your HTML and JavaScript files. They must be named exactly as mentioned above.

Happy gaming!
