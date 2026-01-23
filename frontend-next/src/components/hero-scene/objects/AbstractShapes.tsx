import React from 'react';

interface AbstractShapesProps {
    sectionIndex?: number;
}

// Three.js libraries have been removed from the project.
// This component is now a placeholder.

export const AbstractShapes = React.forwardRef<unknown, AbstractShapesProps>((props, ref) => {
  return null;
});
AbstractShapes.displayName = 'AbstractShapes';