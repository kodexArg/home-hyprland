#!/usr/bin/env python3
"""Unit tests for the simplified dual dispatch architecture (stream vs thinking/queue) and FSM states."""

from unittest.mock import MagicMock, patch
import unittest

from dictate import (
    BrainFSM,
    BrainState,
    FasterWhisperBackend,
    QueueManager,
    STTRouter,
    VRAMTelemetry,
    dispatch_to_stream,
    dispatch_to_thinking,
)


class TestDualDispatchFSM(unittest.TestCase):
    def setUp(self):
        QueueManager._instance = None
        BrainFSM._instance = None
        self.queue_manager = QueueManager.get_instance()
        self.brain = BrainFSM.get_instance()
        self.brain._state = BrainState.STANDBY
        self.brain.can_receive_chunk = MagicMock(return_value=True)
        self.queue_manager.clear()

    def tearDown(self):
        self.queue_manager.clear()

    @patch("dictate.paste_to_target_window")
    @patch("dictate.get_active_window_info", return_value=("0x123", "editor"))
    def test_dispatch_to_stream_direct_paste(self, mock_window, mock_paste):
        mock_paste.return_value = True
        result = dispatch_to_stream("hola mundo", "0x123", "editor", verbal_enter=False)
        self.assertTrue(result)
        mock_paste.assert_called_once_with("hola mundo ", "0x123", "editor", press_enter=False)

    @patch("dictate.paste_to_target_window")
    def test_dispatch_to_stream_empty_text_ignored(self, mock_paste):
        result = dispatch_to_stream("   ", None, "")
        self.assertFalse(result)
        mock_paste.assert_not_called()

    def test_dispatch_to_thinking_accumulates_words_without_space(self):
        # When words are said without space boundary (is_space=False), they accumulate in QueueManager
        with patch.object(self.brain, "dispatch_direct") as mock_direct:
            result = dispatch_to_thinking("hola", "0x123", "editor", is_space=False)
            self.assertFalse(result)
            self.assertEqual(self.queue_manager.accumulated_text, "hola")
            self.assertEqual(self.queue_manager.pile, 1)
            mock_direct.assert_not_called()

            # Second word
            result = dispatch_to_thinking("mundo", "0x123", "editor", is_space=False)
            self.assertFalse(result)
            self.assertEqual(self.queue_manager.accumulated_text, "hola mundo")
            self.assertEqual(self.queue_manager.pile, 2)
            mock_direct.assert_not_called()

    def test_dispatch_to_thinking_sends_all_words_on_space(self):
        # Accumulate first
        dispatch_to_thinking("escribe una función", "0x123", "editor", is_space=False)
        self.assertEqual(self.queue_manager.pile, 1)

        # Space/silence boundary triggers dispatch of all words consolidated
        with patch.object(self.brain, "dispatch_direct", return_value=True) as mock_direct:
            result = dispatch_to_thinking("en python", "0x123", "editor", is_space=True)
            self.assertTrue(result)
            mock_direct.assert_called_once_with("escribe una función en python", "0x123", "editor")
            # Queue is drained
            self.assertEqual(self.queue_manager.pile, 0)
            self.assertEqual(self.queue_manager.accumulated_text, "")

    @patch("dictate.is_brain_active", return_value=True)
    def test_brain_fsm_dispatch_direct_sets_thinking_green(self, mock_active):
        with patch("threading.Thread") as mock_thread, patch.object(self.brain, "write_state") as mock_write:
            mock_thread_instance = MagicMock()
            mock_thread.return_value = mock_thread_instance

            dispatched = self.brain.dispatch_direct("crear archivo", "0x123", "terminal")
            self.assertTrue(dispatched)
            self.assertEqual(self.brain.state, BrainState.THINKING)
            self.assertEqual(self.brain.pile, 1)
            mock_write.assert_called_with("thinking:crear archivo", pile=1)
            mock_thread_instance.start.assert_called_once()

    def test_faster_whisper_uses_greedy_beam_size_1(self):
        backend = FasterWhisperBackend()
        mock_raw_model = MagicMock()
        mock_raw_model.transcribe.return_value = ([], MagicMock())
        backend._model = mock_raw_model

        dummy_audio = [0.0] * 1600
        backend.transcribe(dummy_audio, language="es")

        _, kwargs = mock_raw_model.transcribe.call_args
        self.assertEqual(kwargs.get("beam_size"), 1)
        self.assertEqual(kwargs.get("best_of"), 1)
        self.assertEqual(kwargs.get("without_timestamps"), True)

    def test_router_discounts_own_loaded_vram_to_prevent_thrashing(self):
        router = STTRouter.get_instance()
        router.reload_config()
        router.set_backend_mode("auto")
        router.set_occupied_trigger_mb(2048)

        cuda_backend = router.get_backend_by_name("whisper-cuda")
        self.assertIsNotNone(cuda_backend)

        # Simulate whisper-cuda loaded taking ~1800 MiB VRAM
        cuda_backend._model = MagicMock()
        router._last_routed_name = "whisper-cuda"

        # Total VRAM is 2741 MiB (Whisper 1800 + Desktop 941). External is 941 <= 2048
        telemetry_with_whisper = VRAMTelemetry(used_mb=2741, total_mb=8192, free_mb=5451)
        selected_backend, reason = router.decide_backend(telemetry_with_whisper)
        self.assertEqual(selected_backend.name, "whisper-cuda")
        self.assertIn("GPU backend active", reason)

        # With CPU fallback eliminated, even under heavy external VRAM it stays on GPU
        telemetry_game_active = VRAMTelemetry(used_mb=5900, total_mb=8192, free_mb=2292)
        selected_backend, reason = router.decide_backend(telemetry_game_active)
        self.assertEqual(selected_backend.name, "whisper-cuda")
        self.assertIn("GPU backend active", reason)


if __name__ == "__main__":
    unittest.main()
