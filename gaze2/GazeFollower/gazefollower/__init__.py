# encoding=utf-8
# Author: GC Zhu
# Email: zhugc2016@gmail.com

# Lazy import to avoid circular dependencies during installation
def __getattr__(name):
    if name == 'GazeFollower':
        from .GazeFollower import GazeFollower
        return GazeFollower
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

__all__ = ['GazeFollower']
