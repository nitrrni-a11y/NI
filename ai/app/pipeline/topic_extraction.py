from collections import Counter
from typing import Dict, List, Tuple

import numpy as np
import spacy
from sentence_transformers import SentenceTransformer
from sklearn.cluster import AgglomerativeClustering

from app.pipeline.schemas import TopicResult


# ============================================================
# CONFIGURATION
# ============================================================

EMBEDDING_MODEL = "all-MiniLM-L6-v2"

# Semantic clustering threshold.
# Lower -> more/smaller topics
# Higher -> fewer/larger topics
CLUSTER_DISTANCE_THRESHOLD = 0.45

MAX_TOPIC_KEYWORDS = 5
TOP_LABEL_KEYWORDS = 3


# ============================================================
# NORMALIZATION RULES
# ============================================================

LEADING_WORDS_TO_REMOVE = {
    "a",
    "an",
    "the",
    "many",
    "some",
    "more",
    "most",
    "few",
    "fewer",
    "several",
    "all",
    "each",
    "any",
    "another",
    "different",
    "various",
    "greater",
    "possible",
    "potential",
}

TRAILING_WORDS_TO_REMOVE = {
    "system",
    "systems",
    "tool",
    "tools",
    "device",
    "devices",
    "method",
    "methods",
}

GENERIC_CONCEPTS = {
    "end",
    "way",
    "time",
    "thing",
    "things",
    "people",
    "person",
    "part",
    "number",
    "example",
    "kind",
    "lot",
    "amount",
    "area",
    "case",
    "use",
    "work",
    "something",
}

CANONICAL_ALIASES = {
    "ai": "artificial intelligence",
    "a i": "artificial intelligence",
    "artificial intelligence system": "artificial intelligence",
    "artificial intelligence systems": "artificial intelligence",
    "machine learning tool": "machine learning",
    "machine learning tools": "machine learning",
}

DISPLAY_NAMES = {
    "artificial intelligence": "Artificial intelligence",
    "machine learning": "Machine learning",
}


# ============================================================
# LAZY LOADED MODELS
# ============================================================

_embedding_model = None
_spacy_model = None


def get_embedding_model():
    global _embedding_model

    if _embedding_model is None:
        _embedding_model = SentenceTransformer(
            EMBEDDING_MODEL
        )

    return _embedding_model


def get_nlp():
    global _spacy_model

    if _spacy_model is None:
        try:
            _spacy_model = spacy.load(
                "en_core_web_sm"
            )
        except OSError as e:
            raise RuntimeError(
                "spaCy model 'en_core_web_sm' is not installed."
            ) from e

    return _spacy_model


# ============================================================
# CONCEPT NORMALIZATION
# ============================================================

def normalize_concept(span) -> Tuple[str, str]:
    """
    Convert a spaCy noun phrase/entity into:

        display_text
        canonical_key

    Example:

        "Many workers"
            ->
        "Workers", "worker"

        "the West Bank"
            ->
        "West Bank", "west bank"

        "artificial intelligence systems"
            ->
        "Artificial intelligence", "artificial intelligence"
    """

    tokens = [
        token
        for token in span
        if not token.is_space and not token.is_punct
    ]

    if not tokens:
        return "", ""

    # --------------------------------------------------------
    # Remove weak leading words
    # --------------------------------------------------------

    while tokens:

        if tokens[0].lower_ in LEADING_WORDS_TO_REMOVE:
            tokens.pop(0)
        else:
            break

    if not tokens:
        return "", ""

    # --------------------------------------------------------
    # Remove weak trailing words
    # --------------------------------------------------------

    while len(tokens) > 1:

        if tokens[-1].lower_ in TRAILING_WORDS_TO_REMOVE:
            tokens.pop()
        else:
            break

    if not tokens:
        return "", ""

    # --------------------------------------------------------
    # Display form
    # --------------------------------------------------------

    display_text = " ".join(
        token.text
        for token in tokens
    ).strip()

    if not display_text:
        return "", ""

    # --------------------------------------------------------
    # Lemma-based semantic form
    #
    # workers -> worker
    # hospitals -> hospital
    # doctors -> doctor
    # --------------------------------------------------------

    lemma_tokens = []

    for token in tokens:

        lemma = token.lemma_.strip().lower()

        if not lemma:
            lemma = token.text.strip().lower()

        if lemma:
            lemma_tokens.append(lemma)

    canonical_key = " ".join(
        lemma_tokens
    ).strip()

    if not canonical_key:
        return "", ""

    # --------------------------------------------------------
    # Apply aliases
    # --------------------------------------------------------

    canonical_key = CANONICAL_ALIASES.get(
        canonical_key,
        canonical_key
    )

    # --------------------------------------------------------
    # Canonical display names
    # --------------------------------------------------------

    if canonical_key in DISPLAY_NAMES:

        display_text = DISPLAY_NAMES[
            canonical_key
        ]

    elif not display_text.isupper():

        display_text = (
            display_text[0].upper()
            + display_text[1:]
        )

    return display_text, canonical_key


def is_valid_concept(
    display_text: str,
    canonical_key: str
) -> bool:

    if not display_text:
        return False

    if not canonical_key:
        return False

    if len(canonical_key) < 3:
        return False

    if canonical_key in GENERIC_CONCEPTS:
        return False

    words = canonical_key.split()

    # Avoid complete clauses.
    if len(words) > 6:
        return False

    if not any(
        character.isalpha()
        for character in display_text
    ):
        return False

    return True


# ============================================================
# EXTRACT CONCEPTS FROM ONE SENTENCE
# ============================================================

def extract_sentence_concepts(text: str):

    nlp = get_nlp()

    doc = nlp(text)

    concepts = {}

    # --------------------------------------------------------
    # Named entities
    # --------------------------------------------------------

    for entity in doc.ents:

        display_text, canonical_key = normalize_concept(
            entity
        )

        if not is_valid_concept(
            display_text,
            canonical_key
        ):
            continue

        concepts.setdefault(
            canonical_key,
            {
                "display": display_text,
                "entity": True,
                "noun_chunk": False,
            }
        )

    # --------------------------------------------------------
    # Noun phrases
    # --------------------------------------------------------

    for chunk in doc.noun_chunks:

        display_text, canonical_key = normalize_concept(
            chunk
        )

        if not is_valid_concept(
            display_text,
            canonical_key
        ):
            continue

        if canonical_key not in concepts:

            concepts[canonical_key] = {
                "display": display_text,
                "entity": False,
                "noun_chunk": True,
            }

        else:

            concepts[canonical_key][
                "noun_chunk"
            ] = True

    return concepts


# ============================================================
# SCORE CONCEPTS WITHIN A TOPIC
# ============================================================

def rank_topic_concepts(
    topic_indices: List[int],
    sentence_records: List[Tuple[str, str, str]]
):

    concept_stats: Dict[str, Dict] = {}

    total_documents = len({
        sentence_records[index][1]
        for index in topic_indices
    })

    for index in topic_indices:

        sentence_id, document_id, text = (
            sentence_records[index]
        )

        concepts = extract_sentence_concepts(
            text
        )

        # Only count a concept once per sentence.
        # Otherwise repeated mention in one sentence
        # artificially dominates the score.
        for canonical_key, info in concepts.items():

            if canonical_key not in concept_stats:

                concept_stats[canonical_key] = {
                    "display": info["display"],
                    "sentence_count": 0,
                    "document_ids": set(),
                    "entity_count": 0,
                    "multiword": len(
                        canonical_key.split()
                    ) > 1,
                }

            stats = concept_stats[
                canonical_key
            ]

            stats["sentence_count"] += 1

            stats["document_ids"].add(
                document_id
            )

            if info["entity"]:
                stats["entity_count"] += 1

    ranked = []

    for canonical_key, stats in concept_stats.items():

        sentence_count = (
            stats["sentence_count"]
        )

        document_count = len(
            stats["document_ids"]
        )

        # ----------------------------------------------------
        # Coverage
        #
        # A concept repeated across a topic is more important
        # than a one-off proper name.
        # ----------------------------------------------------

        sentence_score = (
            sentence_count * 2.0
        )

        document_score = (
            document_count * 3.0
        )

        coverage_score = 0.0

        if total_documents > 0:

            coverage_score = (
                document_count
                / total_documents
            ) * 3.0

        # ----------------------------------------------------
        # Phrase bonus
        # ----------------------------------------------------

        phrase_bonus = (
            1.5
            if stats["multiword"]
            else 0.0
        )

        # ----------------------------------------------------
        # Entity bonus
        #
        # Deliberately kept small.
        #
        # This prevents "Israeli" or "United Kingdom"
        # from automatically dominating a topic.
        # ----------------------------------------------------

        entity_bonus = (
            min(stats["entity_count"], 2)
            * 0.75
        )

        score = (
            sentence_score
            + document_score
            + coverage_score
            + phrase_bonus
            + entity_bonus
        )

        ranked.append(
            (
                score,
                canonical_key,
                stats["display"],
                sentence_count,
                document_count,
            )
        )

    # Highest score first.
    ranked.sort(
        key=lambda item: (
            -item[0],
            -item[4],
            -item[3],
            item[1],
        )
    )

    return ranked


# ============================================================
# REMOVE REDUNDANT CONCEPTS
# ============================================================

def select_topic_keywords(
    ranked_concepts,
    max_keywords: int
):

    selected = []
    selected_keys = []

    for (
        score,
        canonical_key,
        display_text,
        sentence_count,
        document_count,
    ) in ranked_concepts:

        if len(selected) >= max_keywords:
            break

        words = set(
            canonical_key.split()
        )

        redundant = False

        for existing_key in selected_keys:

            existing_words = set(
                existing_key.split()
            )

            # Exact duplicate.
            if canonical_key == existing_key:

                redundant = True
                break

            # Don't select "intelligence" if we already
            # selected "artificial intelligence".
            if (
                len(words) == 1
                and words.issubset(existing_words)
            ):

                redundant = True
                break

        if redundant:
            continue

        selected.append(
            display_text
        )

        selected_keys.append(
            canonical_key
        )

    return selected


# ============================================================
# MAIN TOPIC EXTRACTION
# ============================================================

def extract_topics(
    sentence_records: List[
        Tuple[str, str, str]
    ]
):

    if not sentence_records:
        return [], {}

    # ========================================================
    # 1. SENTENCE TEXT
    # ========================================================

    texts = [
        record[2]
        for record in sentence_records
    ]

    # ========================================================
    # 2. SENTENCE EMBEDDINGS
    # ========================================================

    model = get_embedding_model()

    embeddings = model.encode(
        texts,
        batch_size=32,
        normalize_embeddings=True,
        show_progress_bar=False,
    )

    embeddings = np.asarray(
        embeddings
    )

    # ========================================================
    # 3. CLUSTERING
    # ========================================================

    if len(texts) == 1:

        labels = np.array([0])

    else:

        clustering = AgglomerativeClustering(
            n_clusters=None,
            metric="cosine",
            linkage="average",
            distance_threshold=CLUSTER_DISTANCE_THRESHOLD,
        )

        labels = clustering.fit_predict(
            embeddings
        )

    # ========================================================
    # 4. NORMALIZE TOPIC IDS
    # ========================================================

    unique_labels = sorted(
        set(
            int(label)
            for label in labels
        )
    )

    label_mapping = {
        old_label: new_label
        for new_label, old_label
        in enumerate(unique_labels)
    }

    normalized_labels = [
        label_mapping[int(label)]
        for label in labels
    ]

    # ========================================================
    # 5. TOPIC -> SENTENCE INDEX
    # ========================================================

    topic_indices: Dict[
        int,
        List[int]
    ] = {}

    for index, topic_id in enumerate(
        normalized_labels
    ):

        topic_indices.setdefault(
            topic_id,
            []
        ).append(index)

    # ========================================================
    # 6. BUILD TOPICS
    # ========================================================

    topics = []

    sentence_topic_map = {}

    for topic_id in sorted(
        topic_indices.keys()
    ):

        indices = topic_indices[
            topic_id
        ]

        # ----------------------------------------------------
        # Rank concepts
        # ----------------------------------------------------

        ranked_concepts = rank_topic_concepts(
            indices,
            sentence_records
        )

        keywords = select_topic_keywords(
            ranked_concepts,
            MAX_TOPIC_KEYWORDS
        )

        if not keywords:

            keywords = [
                "General topic"
            ]

        # ----------------------------------------------------
        # Label
        # ----------------------------------------------------

        label = " / ".join(
            keywords[:TOP_LABEL_KEYWORDS]
        )

        # ----------------------------------------------------
        # Sentence IDs / document IDs
        # ----------------------------------------------------

        sentence_ids = []
        document_ids = []

        for index in indices:

            sentence_id = (
                sentence_records[index][0]
            )

            document_id = (
                sentence_records[index][1]
            )

            sentence_ids.append(
                sentence_id
            )

            if document_id not in document_ids:

                document_ids.append(
                    document_id
                )

            sentence_topic_map[
                sentence_id
            ] = topic_id

        # ----------------------------------------------------
        # Final topic
        # ----------------------------------------------------

        topics.append(
            TopicResult(
                topic_id=topic_id,
                label=label,
                keywords=keywords,
                sentence_ids=sentence_ids,
                document_ids=document_ids,
            )
        )

    return topics, sentence_topic_map