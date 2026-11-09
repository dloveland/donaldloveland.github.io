"""Rebuild paper communities and positions using scripts/requirements-atlas.txt.

The visible edges remain the researched reading connections. TF-IDF cosine
similarity of titles and curated summaries weights those edges for Louvain.
Clustering does not infer citations. No remote model or service is required.
"""

from collections import Counter
import json
import math
from pathlib import Path
import re

import networkx as nx
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "_data/paper_atlas.json"
SEED = 41
STOP_WORDS = set(
    "a an the and or of in on for to from with by as at is are be that this these "
    "those it its into how what when which can both one each through using use "
    "uses used study studies work paper models model learning based propose "
    "shows show also more than between while their they them we our has have "
    "without across".split()
)
# Readable labels assigned AFTER clustering; these do not affect membership.
COMMUNITY_LABELS = [
    ("semantic-initialization", "Recommendation", "#245d53"),
    ("gala", "Graph structure & prediction", "#406779"),
    ("paper-12", "Explanations & scientific ML", "#766383"),
    ("paper-8", "Graph editing & assignment", "#985a44"),
    ("paper-17", "Early astronomy", "#69705f"),
]


def text_vectors(nodes, papers):
    """L2-normalized unigram and bigram TF-IDF vectors from titles and summaries."""
    features = {}
    for node in nodes:
        text = papers[node["id"]]["title"] + " " + node["summary"]
        words = [
            word for word in re.findall(r"[a-z]+", text.lower())
            if len(word) > 2 and word not in STOP_WORDS
        ]
        features[node["id"]] = Counter(
            words + [" ".join(pair) for pair in zip(words, words[1:])]
        )
    frequency = Counter(term for terms in features.values() for term in terms)
    vectors = {}
    for paper_id, terms in features.items():
        vector = {
            term: (1 + math.log(count))
            * (1 + math.log((len(features) + 1) / (frequency[term] + 1)))
            for term, count in terms.items()
        }
        norm = math.sqrt(sum(value * value for value in vector.values()))
        vectors[paper_id] = {term: value / norm for term, value in vector.items()}
    return vectors


def position_nodes(graph, membership):
    """Weighted spring layout, followed by label collision avoidance."""
    main = graph.subgraph([node for node in graph if graph.degree(node)]).copy()
    for a, b, edge in main.edges(data=True):
        # Strengthen attraction inside the detected groups.
        edge["layout_weight"] = edge["weight"] * (
            2.8 if membership[a] == membership[b] else 0.55
        )
    raw = nx.spring_layout(
        main, seed=SEED, iterations=700, k=0.38, weight="layout_weight"
    )
    ids = sorted(main)
    coords = np.array([raw[paper_id] for paper_id in ids])
    coords = (coords - coords.min(axis=0)) / np.ptp(coords, axis=0)
    width, height = 780, 800
    coords = coords * [width - 170, height - 245] + [85, 65]

    # Place labels near their spring anchors on a fine candidate lattice.
    # High-degree nodes go first; low-degree nodes yield room to their neighbors.
    # Only positions move: memberships and connections remain unchanged.
    anchors = {paper_id: coords[i] for i, paper_id in enumerate(ids)}
    candidates = np.array(
        [[x, y] for y in range(40, height - 90, 8)
         for x in range(65, width - 60, 8)], dtype=float
    )
    positions = {}
    isolated = [node for node in sorted(graph) if not graph.degree(node)]
    for i, paper_id in enumerate(isolated):
        positions[paper_id] = np.array([95 + 150 * i, height - 95], dtype=float)
    for paper_id in sorted(ids, key=lambda node: (-graph.degree(node), node)):
        choices = np.vstack([anchors[paper_id], candidates])
        for position in positions.values():
            delta = np.abs(choices - position)
            choices = choices[(delta[:, 0] >= 122) | (delta[:, 1] >= 92)]
        if not len(choices):
            raise ValueError("Atlas needs a larger canvas to keep labels readable")
        distance = np.sum((choices - anchors[paper_id]) ** 2, axis=1)
        positions[paper_id] = choices[np.argmin(distance)]
    return width, height, positions


def main():
    atlas = json.loads(TARGET.read_text())
    papers = {
        paper["id"]: paper
        for paper in json.loads((ROOT / "_data/publications.json").read_text())
    }
    vectors = text_vectors(atlas["nodes"], papers)
    graph = nx.Graph()
    graph.add_nodes_from(sorted(vectors))
    for edge in atlas["edges"]:
        a, b = vectors[edge["source"]], vectors[edge["target"]]
        similarity = sum(value * b.get(term, 0) for term, value in a.items())
        edge["similarity"] = round(similarity, 5)
        edge["weight"] = round(0.5 + 2 * similarity, 5)
        graph.add_edge(edge["source"], edge["target"], weight=edge["weight"])
    communities = nx.community.louvain_communities(
        graph, weight="weight", resolution=1, seed=SEED
    )
    communities.sort(key=lambda ids: (atlas["default_paper"] not in ids, min(ids)))
    membership = {}
    atlas["communities"] = []
    for i, ids in enumerate(communities):
        name, color = next(
            ((name, color) for anchor, name, color in COMMUNITY_LABELS if anchor in ids),
            ("Related research", "#69705f"),
        )
        key = f"community-{i + 1}"
        atlas["communities"].append(
            dict(id=key, label=name, color=color, papers=sorted(ids))
        )
        membership.update({paper_id: key for paper_id in ids})

    width, height, positions = position_nodes(graph, membership)
    for node in atlas["nodes"]:
        node["community"] = membership[node["id"]]
        node["x"], node["y"] = [round(float(n), 2) for n in positions[node["id"]]]
    atlas["width"], atlas["height"] = width, height
    atlas["clustering"] = dict(
        method="Louvain",
        similarity="TF-IDF cosine similarity of paper titles and summaries",
        weight="0.5 + 2 × cosine similarity",
        resolution=1,
        seed=SEED,
        modularity=round(nx.community.modularity(graph, communities), 4),
        implementation=f"NetworkX {nx.__version__}",
    )
    TARGET.write_text(json.dumps(atlas, ensure_ascii=False, indent=2) + "\n")
    print(
        f"{len(communities)} communities; modularity {atlas['clustering']['modularity']}; "
        f"{len(graph.edges)} curated edges"
    )
    for community in atlas["communities"]:
        print(community["label"] + ": " + ", ".join(community["papers"]))


if __name__ == "__main__":
    main()
