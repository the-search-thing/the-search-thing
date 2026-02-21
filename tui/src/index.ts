import {
  ASCIIFont,
  Box,
  BoxRenderable,
  createCliRenderer,
  Text,
} from "@opentui/core";

const renderer = await createCliRenderer({ exitOnCtrlC: true });

const welcomeScreen = new BoxRenderable(renderer, {
  id: "welcome",
  alignItems: "center",
  justifyContent: "center",
  flexGrow: 1,
});

welcomeScreen.add(
  Box(
    {
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "column",
      gap: 1,
    },
    ASCIIFont({ font: "tiny", text: "the-search-thing" }),
    Text({ content: "what will you search for today?", fg: "#888888" }),
  ),
);
const container = new BoxRenderable(renderer, {
  id: "container",
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  width: "100%",
  height: "100%",
});

const leftPanel = new BoxRenderable(renderer, {
  id: "left",
  flexGrow: 1,
  height: "100%",
  backgroundColor: "#444",
});

const rightPanel = new BoxRenderable(renderer, {
  id: "right",
  width: 20,
  height: "100%",
  backgroundColor: "#000",
});
container.add(rightPanel);
container.add(leftPanel);

type ScreenId = "welcome" | "main";

const screens = {
  welcome: welcomeScreen,
  main: container,
} satisfies Record<ScreenId, BoxRenderable>;

let currentScreen: ScreenId | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const animateOpacity = (
  renderable: BoxRenderable,
  from: number,
  to: number,
  durationMs: number,
) =>
  new Promise<void>((resolve) => {
    const start = Date.now();
    const tickMs = 16;

    renderable.opacity = from;
    renderer.requestLive();

    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / durationMs);
      renderable.opacity = from + (to - from) * t;

      if (t >= 1) {
        clearInterval(timer);
        renderer.dropLive();
        resolve();
      }
    }, tickMs);
  });

const setScreen = (next: ScreenId) => {
  if (currentScreen === next) return;

  if (currentScreen) {
    renderer.root.remove(screens[currentScreen].id ?? "");
  }

  renderer.root.add(screens[next]);
  currentScreen = next;
};

const transitionTo = async (next: ScreenId) => {
  if (currentScreen && currentScreen !== next) {
    await animateOpacity(screens[currentScreen], 1, 0, 300);
  }

  setScreen(next);
  await animateOpacity(screens[next], 0, 1, 300);
};

setScreen("welcome");
await sleep(1500);
await transitionTo("main");
