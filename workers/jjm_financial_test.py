import unittest
from jjm_financial import encode, validate


class JJMTests(unittest.TestCase):
    def test_official_parameter_encoding(self):
        self.assertEqual(encode("0"), "11")
        self.assertEqual(encode("2023-2024"), "3134.31351")

    def test_no_placeholder_or_conflicting_context(self):
        with self.assertRaises(ValueError):
            validate({"d": []})
        row = {"KeyValue": "35", "Name": "Andaman & Nicobar Islands", "Amount": "4"}
        self.assertEqual(len(validate({"d": [row]})), 1)
        with self.assertRaises(ValueError):
            validate({"d": [row, row]})
