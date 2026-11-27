"""Geometry-only interchange format shared with the Three.js event mascot renderer."""
import re

SHAPES = ('ellipsoid', 'box', 'cone', 'cylinder', 'torus')
GROUPS = ('body', 'leftArm', 'rightArm', 'mouth')
PART_KEYS = {'shape', 'group', 'color', 'position', 'size', 'rotation'}


def _vector(value, low, high):
    return (isinstance(value, list) and len(value) == 3
            and all(type(n) in (int, float) and low <= n <= high for n in value))


def valid_recipe(recipe):
    if not isinstance(recipe, dict) or set(recipe) != {'version', 'parts'}:
        return False
    parts = recipe['parts']
    if type(recipe['version']) is not int or recipe['version'] != 1 or not isinstance(parts, list) or not 4 <= len(parts) <= 48:
        return False
    groups = set()
    for part in parts:
        if not isinstance(part, dict) or set(part) != PART_KEYS:
            return False
        if part['shape'] not in SHAPES or part['group'] not in GROUPS:
            return False
        if not isinstance(part['color'], str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', part['color']):
            return False
        if not (_vector(part['position'], -5, 5) and _vector(part['size'], .01, 5) and _vector(part['rotation'], -360, 360)):
            return False
        groups.add(part['group'])
    return groups == set(GROUPS)
