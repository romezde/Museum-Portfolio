# The Personal Museum

Open `index.html` in a modern browser. No build step, downloads, or external libraries are required.

Scroll on desktop or swipe vertically on a phone to walk. Select a frame to enlarge its image. Collection provides a keyboard-accessible, responsive grid. Gallery settings adjusts the spherical floor, including a flat option. Reduced-motion preferences remove camera easing.

## Add your work

## Where to edit

| What you want to change                      | File                                         |
| -------------------------------------------- | -------------------------------------------- |
| Your name, introduction, and button text     | `index.html`                                 |
| Colors, fonts, spacing, and mobile layout    | `style.css`                                  |
| Section names, image paths, and captions     | `projects.js`                                |
| Hallway width, photo size, and walking speed | `GALLERY_SETTINGS` at the top of `script.js` |
| Local preview server                         | `server.cjs`                                 |

The JavaScript has numbered sections so you can separate editable settings,
drawing math, and button interactions. You do not need to change the perspective
math to add your work.

### Common gallery adjustments

- Increase `artworkMaxWidth` and `artworkMaxHeight` to make pictures larger.
- Decrease `distantHallwayWidth` to make the far end narrower.
- Increase `nearbyWidthIncrease` to make the hallway open wider near the viewer.
- Increase `artworkRowSpacing` to leave more space between pairs of pictures.
- Increase `scrollPixelsPerUnit` to walk more slowly for the same scroll distance.

Save your file and refresh the browser to see a change. Screenshot previews
selected through the website will reset on refresh.

### Add an image

For example, one entry in `projects.js` can look like this:

```js
{
  title: "JCoins lobby",
  description: "The main hangout space I built.",
  image: "images/jcoins-lobby.jpg",
}
```

Keep a comma between entries. Use `null` for a sample placeholder.

### Formatting

The project uses two-space indentation. To format after editing, run:

```sh
npx prettier --write index.html style.css script.js projects.js server.cjs README.md
```

The included `.prettierrc.json` keeps formatting consistent.

### Project content

Edit `projects.js`: change section names and add 4–8 works per section. Each work has `title`, `description`, and `image` (a relative image path, such as `images/lobby.jpg`). Save screenshots in an `images` folder. Images are preloaded and keep their proportions. The artwork currently shown is clearly labeled sample art, not your work. The second section is a placeholder.

You can also tap a frame and choose **Try your own screenshot** for a temporary local preview. This is not uploaded or saved; refresh restores the project list.

Edit the introduction and museum name in `index.html`. The curvature defaults to 55; its corresponding radius in `script.js` is 70. All rendering is local canvas geometry with perspective-mapped images.

For a local server, run `node server.cjs` and visit http://localhost:4173. For hosting, upload the HTML, CSS, JavaScript, and image files to any static website host.
