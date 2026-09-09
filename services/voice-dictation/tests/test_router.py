#!/usr/bin/env python3
"""Unit tests for STTRouter, VRAM telemetry, backend strategies, and dynamic threshold routing."""

from unittest.mock import MagicMock, patch
import unittest

from dictate import (
    FasterWhisperBackend,
    Qwen3ASRBackend,
    STTBackend,
    STTRouter,
    VRAMMonitor,
    VRAMTelemetry,
)


class TestVRAMTelemetry(unittest.TestCase):
    def test_occupied_boundary(self):
        # Exact boundary check: 2048 is NOT occupied (used <= trigger)
        telemetry_at_boundary = VRAMTelemetry(used_mb=2048, total_mb=8192, free_mb=6144)
        self.assertFalse(telemetry_at_boundary.is_occupied(2048))

        # 2049 IS occupied (used > trigger)
        telemetry_above = VRAMTelemetry(used_mb=2049, total_mb=8192, free_mb=6143)
        self.assertTrue(telemetry_above.is_occupied(2048))

        # 1000 is NOT occupied
        telemetry_below = VRAMTelemetry(used_mb=1000, total_mb=8192, free_mb=7192)
        self.assertFalse(telemetry_below.is_occupied(2048))

    def test_telemetry_properties(self):
        telemetry = VRAMTelemetry(used_mb=4096, total_mb=8192, free_mb=4096)
        self.assertEqual(telemetry.used_gb, 4.0)
        self.assertEqual(telemetry.total_gb, 8.0)
        self.assertEqual(telemetry.free_gb, 4.0)
        self.assertEqual(telemetry.used_percentage, 50.0)


class MockCustomBackend(STTBackend):
    def __init__(self, name: str = "mock-backend", device: str = "cuda") -> None:
        self._name = name
        self._device = device
        self.loaded = False
        self.unloaded = False

    @property
    def name(self) -> str:
        return self._name

    @property
    def device(self) -> str:
        return self._device

    @property
    def compute_type(self) -> str:
        return "mock"

    @property
    def vram_requirement_mb(self) -> int:
        return 1000

    def is_available(self) -> bool:
        return True

    def is_loaded(self) -> bool:
        return self.loaded

    def load(self) -> None:
        self.loaded = True

    def unload(self) -> None:
        self.unloaded = True
        self.loaded = False

    def transcribe(self, audio_input, language="es", vad_filter=False, without_timestamps=True):
        return ["mock transcription"]


class TestSTTRouter(unittest.TestCase):
    def setUp(self):
        self.router = STTRouter()
        self.router._notify_on_switch = False  # Avoid desktop notifications during unit tests

    def test_whisper_cpu_permanently_eliminated(self):
        # whisper-cpu must not be in registered backends
        self.assertNotIn("whisper-cpu", self.router._backends)
        with self.assertRaises(ValueError):
            self.router.set_backend_mode("whisper-cpu")

    def test_routing_strictly_gpu_regardless_of_vram(self):
        # Even if 4500 MiB is used, CPU fallback is eliminated -> stays on GPU
        self.router._backend_mode = "auto"
        telemetry = VRAMTelemetry(used_mb=4500, total_mb=8192, free_mb=3692)
        backend, reason = self.router.decide_backend(telemetry)

        self.assertEqual(backend.name, "whisper-cuda")
        self.assertEqual(backend.device, "cuda")
        self.assertIn("GPU backend active", reason)

    def test_auto_routing_when_vram_free(self):
        self.router._backend_mode = "auto"
        telemetry = VRAMTelemetry(used_mb=1200, total_mb=8192, free_mb=6992)
        backend, reason = self.router.decide_backend(telemetry)

        self.assertEqual(backend.name, "whisper-cuda")
        self.assertEqual(backend.device, "cuda")
        self.assertIn("GPU backend active", reason)

    def test_manual_override_modes(self):
        telemetry = VRAMTelemetry(used_mb=7000, total_mb=8192, free_mb=1192)

        # Force whisper-cuda
        self.router._backend_mode = "whisper-cuda"
        backend, reason = self.router.decide_backend(telemetry)
        self.assertEqual(backend.name, "whisper-cuda")
        self.assertIn("manual config override", reason)

    def test_transition_unloads_previous_backend(self):
        mock_gpu = MockCustomBackend("mock-gpu", "cuda")
        mock_cpu = MockCustomBackend("mock-cpu", "cpu")
        self.router.register_backend(mock_gpu)
        self.router.register_backend(mock_cpu)
        self.router._preferred_gpu = "mock-gpu"

        # First resolution: low VRAM -> chooses mock-gpu
        with patch.object(VRAMMonitor, "get_telemetry", return_value=VRAMTelemetry(1000, 8192, 7192)):
            self.router.decide_backend = MagicMock(return_value=(mock_gpu, "GPU free"))
            active_1 = self.router.resolve_backend()
            self.assertEqual(active_1.name, "mock-gpu")

        # Second resolution: chooses mock-cpu, MUST unload mock-gpu
        with patch.object(VRAMMonitor, "get_telemetry", return_value=VRAMTelemetry(5000, 8192, 3192)):
            self.router.decide_backend = MagicMock(return_value=(mock_cpu, "switch"))
            active_2 = self.router.resolve_backend()
            self.assertEqual(active_2.name, "mock-cpu")
            self.assertTrue(mock_gpu.unloaded)

    def test_gpu_preferred_selection_in_auto_mode(self):
        self.router._backend_mode = "auto"
        telemetry = VRAMTelemetry(used_mb=2500, total_mb=8192, free_mb=5692)
        backend, reason = self.router.decide_backend(telemetry)
        self.assertEqual(backend.name, "whisper-cuda")
        self.assertIn("GPU backend active", reason)


class TestBackendImplementations(unittest.TestCase):
    def test_faster_whisper_backend_attributes(self):
        backend_cuda = FasterWhisperBackend(device="cuda", compute_type="float16")
        self.assertEqual(backend_cuda.name, "whisper-cuda")
        self.assertEqual(backend_cuda.device, "cuda")
        self.assertEqual(backend_cuda.compute_type, "float16")
        self.assertEqual(backend_cuda.vram_requirement_mb, 1800)

        backend_cpu = FasterWhisperBackend(device="cpu", compute_type="int8")
        self.assertEqual(backend_cpu.name, "whisper-cpu")
        self.assertEqual(backend_cpu.device, "cpu")
        self.assertEqual(backend_cpu.compute_type, "int8")
        self.assertEqual(backend_cpu.vram_requirement_mb, 0)

    def test_qwen3_asr_backend_attributes(self):
        backend_qwen = Qwen3ASRBackend(device="cuda", compute_type="bfloat16")
        self.assertEqual(backend_qwen.name, "qwen3-asr")
        self.assertEqual(backend_qwen.device, "cuda")
        self.assertEqual(backend_qwen.compute_type, "bfloat16")
        self.assertEqual(backend_qwen.vram_requirement_mb, 4000)


if __name__ == "__main__":
    unittest.main()
