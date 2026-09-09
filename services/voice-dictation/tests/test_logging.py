#!/usr/bin/env python3
"""Unit tests for the 4-tier concurrent FSM logging subsystem and deterministic rotation."""

from concurrent.futures import ThreadPoolExecutor
import os
import shutil
import tempfile
import unittest

from dictate import (
    ConcurrentRotatingFileLogger,
    FSMLogManager,
)


class TestConcurrentRotatingFileLogger(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="dictate_log_test_")
        self.log_file = os.path.join(self.temp_dir, "test.log")

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_single_threaded_write(self):
        logger = ConcurrentRotatingFileLogger(self.log_file, max_bytes=10000, backup_count=3)
        logger.write_line("line 1")
        logger.write_line("line 2\n")

        with open(self.log_file, "r", encoding="utf-8") as f:
            lines = [line.strip() for line in f.readlines()]

        self.assertEqual(lines, ["line 1", "line 2"])

    def test_concurrent_multithreaded_writes(self):
        # 20 threads writing 50 lines each = 1000 lines
        logger = ConcurrentRotatingFileLogger(self.log_file, max_bytes=1000000, backup_count=3)
        total_workers = 20
        lines_per_worker = 50

        def worker(worker_id: int):
            for i in range(lines_per_worker):
                logger.write_line(f"worker_{worker_id:02d}_record_{i:04d}")

        with ThreadPoolExecutor(max_workers=total_workers) as executor:
            futures = [executor.submit(worker, w) for w in range(total_workers)]
            for f in futures:
                f.result()

        with open(self.log_file, "r", encoding="utf-8") as f:
            lines = [line.strip() for line in f.readlines()]

        self.assertEqual(len(lines), total_workers * lines_per_worker)
        # Verify no torn lines
        for line in lines:
            self.assertTrue(line.startswith("worker_"))

    def test_deterministic_rotation(self):
        # Small max_bytes to force rotation: 120 bytes (~4-5 lines of 30 chars)
        logger = ConcurrentRotatingFileLogger(self.log_file, max_bytes=120, backup_count=3)

        for i in range(25):
            logger.write_line(f"record_number_{i:04d}_padding_xxxx")

        # Base file and rotations must exist
        self.assertTrue(os.path.exists(self.log_file))
        self.assertTrue(os.path.exists(f"{self.log_file}.1"))
        self.assertTrue(os.path.exists(f"{self.log_file}.2"))
        self.assertTrue(os.path.exists(f"{self.log_file}.3"))
        # Beyond backup_count must NOT exist
        self.assertFalse(os.path.exists(f"{self.log_file}.4"))


class TestFSMLogManager(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="dictate_fsm_mgr_test_")
        self.mgr = FSMLogManager(log_dir=self.temp_dir)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_isolated_and_unified_trajectory_logging(self):
        # Simulate cross-FSM sequence
        self.mgr.log_fsm1_transition("MIC_OFF", "MIC_ON", detail="session_start")
        self.mgr.log_fsm2_transition("idle", "arming", detail="worker_retarget")
        self.mgr.log_fsm3_transition("off", "standby", detail="brain_ready")
        self.mgr.log_fsm2_transition("arming", "rec", detail="standby_listening")

        # Verify FSM 1 log
        fsm1_path = os.path.join(self.temp_dir, "fsm1_mic_gate.log")
        self.assertTrue(os.path.exists(fsm1_path))
        with open(fsm1_path, "r", encoding="utf-8") as f:
            fsm1_lines = f.readlines()
        self.assertEqual(len(fsm1_lines), 1)
        self.assertIn("[FSM1_MIC] MIC_OFF -> MIC_ON", fsm1_lines[0])
        self.assertIn("detail='session_start'", fsm1_lines[0])

        # Verify FSM 2 log
        fsm2_path = os.path.join(self.temp_dir, "fsm2_dictator_queue.log")
        self.assertTrue(os.path.exists(fsm2_path))
        with open(fsm2_path, "r", encoding="utf-8") as f:
            fsm2_lines = f.readlines()
        self.assertEqual(len(fsm2_lines), 2)
        self.assertIn("idle -> arming", fsm2_lines[0])
        self.assertIn("arming -> rec", fsm2_lines[1])

        # Verify FSM 3 log
        fsm3_path = os.path.join(self.temp_dir, "fsm3_cognitive_brain.log")
        self.assertTrue(os.path.exists(fsm3_path))
        with open(fsm3_path, "r", encoding="utf-8") as f:
            fsm3_lines = f.readlines()
        self.assertEqual(len(fsm3_lines), 1)
        self.assertIn("off -> standby", fsm3_lines[0])

        # Verify Unified General Trajectory Log
        gen_path = os.path.join(self.temp_dir, "fsm_unified_trajectory.log")
        self.assertTrue(os.path.exists(gen_path))
        with open(gen_path, "r", encoding="utf-8") as f:
            gen_lines = f.readlines()
        self.assertEqual(len(gen_lines), 4)

        # Verify macro-state trajectory format on each entry
        self.assertIn("path: [MIC_OFF->MIC_ON | idle | off]", gen_lines[0])
        self.assertIn("path: [MIC_ON | idle->arming | off]", gen_lines[1])
        self.assertIn("path: [MIC_ON | arming | off->standby]", gen_lines[2])
        self.assertIn("path: [MIC_ON | arming->rec | standby]", gen_lines[3])

        # Verify monotonic sequence IDs
        self.assertIn("[#000001]", gen_lines[0])
        self.assertIn("[#000002]", gen_lines[1])
        self.assertIn("[#000003]", gen_lines[2])
        self.assertIn("[#000004]", gen_lines[3])

    def test_log_status_introspection(self):
        status = self.mgr.get_log_status()
        self.assertEqual(status["log_dir"], self.temp_dir)
        self.assertIn("fsm1_mic_gate", status["logs"])
        self.assertIn("fsm2_dictator_queue", status["logs"])
        self.assertIn("fsm3_cognitive_brain", status["logs"])
        self.assertIn("fsm_unified_trajectory", status["logs"])

    def test_manual_rotate_all(self):
        self.mgr.log_fsm1_transition("MIC_OFF", "MIC_ON")
        self.mgr.log_fsm2_transition("idle", "rec")
        self.mgr.log_fsm3_transition("off", "standby")

        self.mgr.rotate_all()

        # Rotated files should exist
        self.assertTrue(os.path.exists(os.path.join(self.temp_dir, "fsm1_mic_gate.log.1")))
        self.assertTrue(os.path.exists(os.path.join(self.temp_dir, "fsm2_dictator_queue.log.1")))
        self.assertTrue(os.path.exists(os.path.join(self.temp_dir, "fsm3_cognitive_brain.log.1")))
        self.assertTrue(os.path.exists(os.path.join(self.temp_dir, "fsm_unified_trajectory.log.1")))


if __name__ == "__main__":
    unittest.main()
