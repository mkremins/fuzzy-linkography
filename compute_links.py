from sentence_transformers import SentenceTransformer, util
import json

model = SentenceTransformer("all-MiniLM-L6-v2")

def compute_links(moves):
	embs = [model.encode(move) for move in moves]
	links = {}
	for i in range(len(moves)):
		links[i] = {}
		for j in range(i):
			links[i][j] = util.cos_sim([embs[i]], [embs[j]])[0].item()
	return links

def add_links_to_file(fpath):
	with open(fpath, "r+") as file:
		data = json.load(file)
		for ep_id, episode in data.items():
			print(ep_id)
			data[ep_id] = {
				"moves": episode,
				"links": compute_links([move["text"] for move in episode])
			}
		file.seek(0)
		json.dump(data, file)

add_links_to_file("data/test.json")
