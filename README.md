# World Racers
Race around any real city in the world, in seconds

## Inspiration

We built World Racing to bring back the joy of exploration through a modern lens. Inspired by our childhood memories of games like Mario Kart and the excitement of zooming through vibrant maps, we wanted to recreate that thrill—except in the real world. With so many young people wanting to travel but facing constraints like time or money, we thought: what if you could race through the streets of Tokyo, Miami, or Paris from your browser?

On a personal level, Mark has always struggled with navigation, often making wrong turns and relying heavily on Apple Maps—even in his own city. World Racing became a fun and practical way for him to get better at recognizing streets and landmarks. Cristy, on the other hand, gets nervous driving in unfamiliar places. This project became a tool for her to build confidence, allowing her to virtually "practice" routes and get familiar with her surroundings beforehand.

Also? It's just really fun. With multiplayer support, you can race against your friends and explore new places at the same time!

![GIF of our project in action](https://worldracers.warrensnipes.dev/EiffelTower.gif)

## What it does

World Racing lets you pick any real-world location and instantly create a racecourse through it. You define the start, finish, and checkpoints, and we build a fully interactive 3D driving experience around it. Before the race starts, you're treated to a cinematic drone flyover of the route, complete with roads, trees, oceans, landmarks, and more. The driving experience includes a 3rd-person camera view that follows your car, with a working speedometer, compass, and visual cues for landmarks and turns. It’s part game, part travel, part simulation—accessible from your browser in seconds.

## How we built it

We used Mapbox GL JS to render realistic 3D maps and terrain, and Three.js to handle the custom 3D car physics and visuals. The app itself is built in React with TailwindCSS for a clean, responsive UI. On the backend, we used Rust with the Axum web framework for high-performance APIs, and PostgreSQL with SeaORM to store and serve course data and user-generated maps. All components work together seamlessly to generate a real-world map, overlay the chosen route, and simulate a racing experience with proper camera and collision logic. We also utilized websockets for real-time, live multiplayer.

We rolled our own physics engine for the car movement, here's some of the math that we utilized:

**Angular Velocity**
![Acceleration over time](https://worldracers.warrensnipes.dev/equation.png)

**Acceleration over time**
![Acceleration over time](https://worldracers.warrensnipes.dev/equation(1).png)

**Velocity over time**
![Acceleration over time](https://worldracers.warrensnipes.dev/equation(2).png)

**Distance from point to line segment with endpoints**
![Acceleration over time](https://worldracers.warrensnipes.dev/equation(3).png)


## Challenges we ran into

Collision detection on 3D maps: Making sure users couldn’t drive through buildings or terrain required custom logic on top of Mapbox's 3D tiles and elevation layers. We had a version that had support for collision detection, but ultimately decided to scrap it, because the 3d maps that we really liked did not have the data necessary in order to have collision detection.

Camera tracking: Creating a smooth third-person camera that reacts naturally to speed, turning, and collisions took several iterations to get right.

Map loading performance: Loading a fully 3D-rendered city on demand while maintaining 60 FPS required lots of optimization, especially when switching between drone view and race mode.

Pathfinding and routing: Translating user-defined points into a logical, drivable path across roads in a 3D environment was more complex than anticipated.

## Accomplishments that we're proud of

- Building a fully interactive driving simulator that works anywhere in the world with a single click.
- Achieving smooth car physics and camera movement within a 3D map of real cities.
- Creating a beautiful cinematic drone sequence that previews your race before you begin.
- Designing a product that blends nostalgia, practicality, and technical achievement in a unique way

## What we learned

- Not to wait until the last minute to implement a multiplayer system using websockets.
- How to work with real-world geospatial data and turn it into an engaging, game-like experience.
- The complexities of combining Three.js physics with Mapbox 3D terrain and tile loading.
- How to architect a fullstack system with React + Rust + PostgreSQL in a performant and scalable way.

## What's next for World Racing

- Refining multiplayer support 
- Multiple car car support
- Racing against AI
- Power-ups
- Adding ramps and more
