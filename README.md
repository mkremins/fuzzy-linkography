# Fuzzy Linkography
...is a technique for automatically generating graphical summaries (*fuzzy linkographs*) of creative activity traces. It builds on [traditional linkography](https://mitpress.mit.edu/9780262027199/linkography/), but allows the very rapid creation of (imperfect) linkographs by automating the annotation of links between design moves.

We've already used fuzzy linkography to analyze a few different trace types, including:

- Sequences of text-to-image prompts by a single user
- Ideas tossed out in a brainstorming session
- Titles of papers by a single author over their whole career

What do all of these have in common? Well, every trace records what's called an *episode* of creative activity. An episode consists of an ordered sequence of *design moves* that occurred in the same *design situation*. Pairwise links between moves can be used to indicate the development of recurring ideas or themes through the episode as a whole, and the structure of the whole linkograph can then be analyzed (both visually and quantitatively) to make sense of the episode's overall shape.

## Usage
First, start up a basic HTTP server at the root of this repository, for instance via Python:

```sh
python3 -m http.server 6060
```

Then navigate in your browser to `localhost:6060` (or wherever you set up the server) to view some fuzzy linkographs computed from the test data in `data/test.json`. It sometimes takes `app.js` a while to do its thing when it's processing large datasets – but it'll log each episode to the console as it processes them, so you can pop open the console to watch its progress before the final rendering pass.

**To visualize your own dataset**, first add it to the `data/` directory as a JSON file. (The "Data format" section of this readme contains some examples of how we expect datasets to look.) Then, modify the `datasetPaths` array in `app.js` to include a pointer to your newly added file.

**To pre-compute links for a dataset** you've already stored in a file (so that `app.js` doesn't have to spend a bunch of time computing links in the browser every time you refresh the page), first modify `compute_links.py` so that the `add_links_to_file` call is pointed at your intended file. Then run the script. This will create a new file with the suffix `_linked.json` in place of `.json` at the end of the original file's name.

**To configure visualization properties**, edit the constants at the top of `app.js`. Properties of particular note are:
- `MOVE_TEXT_MODE`, used to configure rendering of textual move labels. Possible values are `"FULL"` (render full move text above every move), `"INDEX"` (render only a numeric move index), and `"NONE"` (don't render text above moves at all.)
- `SHOULD_COLORIZE_LINKS`, used to enable or disable link colorization in multi-actor linkographs.
- `MIN_LINK_STRENGTH`, used to set the cutoff "raw" cosine similarity value that must be exceeded for a link to be drawn between a given pair of moves.
- `SEGMENT_THRESHOLD`, used to set how many milliseconds must elapse between two timestamped moves before a dotted vertical line is rendered between them.

## Data format
In our current implementation of fuzzy linkography, a design move looks roughly like the following:

```json
{
	"text": "smash the plates on the floor",
	"timestamp": "2024-12-11T01:46:09.656Z",
	"actor": 1
}
```

...where everything except the short `text` string is optional.

- The `actor` value, if present, is a numeric ID representing the "actor index" of whoever performed this design move. We use this to visualize episodes involving multiple different actors (e.g., group members in a group brainstorming session; the human and the computer if we're looking at logs of someone working with a co-creative AI system). Currently the only supported actor indexes are `0` and `1`.
- The `timestamp` value, if present, is a datetime string indicating when this design move occurred. We use these to render visual separators in fuzzy linkographs between pairs of moves that were separated by at least some minimum amount of time.

Why do design moves have to be short text strings? Well, in a broad sense, they don't *have* to be; it's just that we're only set up to automatically infer links between short text strings right now. In the future, we hope that this technique can also be pretty easily extended to work with longer texts, images, and basically any other kinds of expressive artifacts between which relatedness can be automatically assessed.

Sets of traces are typically stored as JSON objects shaped like the following:

```json
{
	"episodeID": [
		{"text": "first design move"},
		{"text": "second design move", "actor": 1}
	],
	"anotherEpisodeID": [
		{"text": "yet more design moves in here"},
	]
}
```

Top-level values may also contain precomputed links between design moves, in which case they need to be objects with (at minimum) the keys `moves` and `links`:

```json
{
	"episodeID": {
		"moves": [
			{"text": "hello"},
			{"text": "hello world"}
		],
		"links": {
			"0": {},
			"1": {"0": 0.7200998082309339}
		}
	},
	"anotherEpisodeID": {
		"moves": [
			{"text": "the same thing thrice"},
			{"text": "the same thing thrice"},
			{"text": "the same thing thrice"}
		],
		"links": {
			"0": {},
			"1": {"0": 1},
			"2": {"0": 1, "1": 1}
		}
	}
}
```

Within `links`, top-level and second-level keys both represent indexes of moves in the associated `moves` array. Each value represents the strength of the link between the top-level and second-level moves. Only *backlinks* are actually stored – i.e., we only explicitly calculate each move's association with the moves *before* it, since the forelinks are symmetrical.

## Publications
If you build on this work, please cite the following [paper](https://arxiv.org/abs/2502.04599):

```bibtex
@misc{FuzzyLinkography,
	title={Fuzzy Linkography: Automatic Graphical Summarization of Creative Activity Traces},
	author={Amy Smith and Barrett R. Anderson and Jasmine Tan Otto and Isaac Karth and Yuqian Sun and John Joon Young Chung and Melissa Roemmele and Max Kreminski},
	year={2025},
	eprint={2502.04599},
	archivePrefix={arXiv},
	primaryClass={cs.HC},
	url={https://arxiv.org/abs/2502.04599},
}
```
