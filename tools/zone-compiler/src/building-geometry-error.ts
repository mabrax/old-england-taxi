/** A source footprint topology outside the compiler's supported simple-ring policy.
 * Only this explicit class may be reported and excluded by the generation workflow.
 * Mesh, projection and component-invariant failures must still abort compilation. */
export class UnsupportedBuildingGeometryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UnsupportedBuildingGeometryError';
  }
}
