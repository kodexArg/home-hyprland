#!/usr/bin/env python3
"""Unit tests for the SOLID TextFilter pipeline and declarative registry in mic-dict-brain."""

import unittest

from dictate import (
    STREAMING_SLICE_PIPELINE,
    UTTERANCE_COMMIT_PIPELINE,
    AcousticArtifactFilter,
    DuplicatePunctuationFilter,
    FilterRegistry,
    HesitationEllipsisFilter,
    MidSentencePunctuationFilter,
    PunctuationSpacingFilter,
    RegexFilterRule,
    TextFilter,
    TextFilterPipeline,
    TrailingPunctuationFilter,
)


class TestTextFilters(unittest.TestCase):
    def test_hesitation_ellipsis_filter(self):
        filter_instance = HesitationEllipsisFilter()
        self.assertEqual(
            filter_instance.filter("prueba de... dictado"),
            "prueba de dictado",
        )
        self.assertEqual(
            filter_instance.filter("espera… qué pasó"),
            "espera qué pasó",
        )
        self.assertEqual(
            filter_instance.filter("uno.. dos.... tres"),
            "uno dos tres",
        )

    def test_mid_sentence_punctuation_filter(self):
        filter_instance = MidSentencePunctuationFilter()
        # Period followed by lowercase should be removed
        self.assertEqual(
            filter_instance.filter("pasando. con los puntos"),
            "pasando con los puntos",
        )
        self.assertEqual(
            filter_instance.filter("puntos. suspensivos"),
            "puntos suspensivos",
        )
        self.assertEqual(
            filter_instance.filter("lo hiciste. bien"),
            "lo hiciste bien",
        )
        # Semicolon followed by lowercase
        self.assertEqual(
            filter_instance.filter("primero; segundo"),
            "primero segundo",
        )
        # Period followed by uppercase MUST be preserved (legitimate sentence boundary)
        self.assertEqual(
            filter_instance.filter("Terminado. Empezamos de nuevo"),
            "Terminado. Empezamos de nuevo",
        )

    def test_trailing_punctuation_filter(self):
        filter_instance = TrailingPunctuationFilter()
        self.assertEqual(
            filter_instance.filter("Hola, hola."),
            "Hola, hola",
        )
        self.assertEqual(
            filter_instance.filter("streaming slice..."),
            "streaming slice",
        )
        self.assertEqual(
            filter_instance.filter("palabra,"),
            "palabra",
        )

    def test_duplicate_punctuation_filter(self):
        filter_instance = DuplicatePunctuationFilter()
        self.assertEqual(
            filter_instance.filter("hola,, amigo.. como estás??"),
            "hola, amigo. como estás?",
        )
        self.assertEqual(
            filter_instance.filter("genial!!!"),
            "genial!",
        )

    def test_punctuation_spacing_filter(self):
        filter_instance = PunctuationSpacingFilter()
        self.assertEqual(
            filter_instance.filter("hola , que tal ?"),
            "hola, que tal?",
        )
        self.assertEqual(
            filter_instance.filter("pregunta.¿Puedes"),
            "pregunta. ¿Puedes",
        )
        self.assertEqual(
            filter_instance.filter("¿ Puedes entrar ?"),
            "¿Puedes entrar?",
        )

    def test_acoustic_artifact_filter(self):
        filter_instance = AcousticArtifactFilter()
        # Mechanical keyboard clicks hallucinated as single/double vowels or transient particles
        clicks = ["a", "a.", "e", "e.", "o", "o.", "u", "ah", "eh", "eh.", "u."]
        for click in clicks:
            self.assertEqual(
                filter_instance.filter(click),
                "",
                f"Failed to drop click transient: {click}",
            )

        # Legitimate speech must be preserved
        legit_words = ["hola", "sí", "no", "bien", "a ver", "un momento", "casa"]
        for legit in legit_words:
            self.assertEqual(
                filter_instance.filter(legit),
                legit,
                f"Accidentally dropped legitimate speech: {legit}",
            )

    def test_user_reported_speech_transformation(self):
        user_raw = (
            "Hola, hola. prueba de... dictado. Me gustaría saber... qué está pasando. "
            "con los... puntos. suspensivos. y los puntos... que aparecen en todo el mundo. "
            "puede entrar puedes sintetizar un... pregunta. ¿Puedes interpretar una pregunta? "
            "Ahí lo hiciste. bien"
        )
        expected = (
            "Hola, hola prueba de dictado. Me gustaría saber qué está pasando con los puntos "
            "suspensivos y los puntos que aparecen en todo el mundo puede entrar puedes sintetizar "
            "un pregunta. ¿Puedes interpretar una pregunta? Ahí lo hiciste bien"
        )

        result = UTTERANCE_COMMIT_PIPELINE.execute(user_raw)
        self.assertEqual(result, expected)

    def test_streaming_slice_pipeline_strips_trailing_punct(self):
        partial_slice = "Hola, hola."
        result = STREAMING_SLICE_PIPELINE.execute(partial_slice)
        self.assertEqual(result, "Hola, hola")

    def test_open_closed_principle_extensibility(self):
        # Verify that custom filters can be composed in code
        class UppercaseKeywordFilter(TextFilter):
            def filter(self, text: str) -> str:
                return text.replace("fsm", "FSM")

        custom_pipeline = TextFilterPipeline([
            HesitationEllipsisFilter(),
            UppercaseKeywordFilter(),
        ])
        self.assertEqual(
            custom_pipeline.execute("sistema de... fsm"),
            "sistema de FSM",
        )

    def test_declarative_regex_filter_rule_actions(self):
        # 1. Replace action
        replace_rule = RegexFilterRule("censor", r"\b(mierda|carajo)\b", action="replace", replacement="[censored]")
        self.assertEqual(replace_rule.filter("vaya mierda de día"), "vaya [censored] de día")

        # 2. Drop match action
        drop_rule = RegexFilterRule("transient", r"^\s*(?:click|clack)\s*$", action="drop_match")
        self.assertEqual(drop_rule.filter("click"), "")
        self.assertEqual(drop_rule.filter("click here"), "click here")

        # 3. Strip trailing action
        trailing_rule = RegexFilterRule("trailing_dots", r"\.+$", action="strip_trailing")
        self.assertEqual(trailing_rule.filter("hola mundo..."), "hola mundo")

    def test_declarative_filter_registry_no_code_change(self):
        # Verify adding filters from declarative JSON dictionary without touching code
        registry = FilterRegistry.get_instance()
        custom_rule_data = {
            "name": "unit_test_no_code_rule",
            "pattern": r"\b(antigravity)\b",
            "action": "replace",
            "replacement": "AGY",
            "flags": ["IGNORECASE"],
            "pipeline": "both",
            "enabled": True,
            "description": "Rule added without touching code",
        }
        registry.add_rule(custom_rule_data)
        try:
            _streaming_pipe, commit_pipe = registry.build_pipelines()
            self.assertEqual(commit_pipe.execute("running on Antigravity today"), "running on AGY today")
        finally:
            registry.remove_rule("unit_test_no_code_rule")


if __name__ == "__main__":
    unittest.main()
