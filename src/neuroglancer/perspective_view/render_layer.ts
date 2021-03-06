/**
 * @license
 * Copyright 2016 Google Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {VisibilityTrackedRenderLayer} from 'neuroglancer/layer';
import {PickIDManager} from 'neuroglancer/object_picking';
import {Mat4, Vec3} from 'neuroglancer/util/geom';
import {ShaderModule} from 'neuroglancer/webgl/shader';

export interface PerspectiveViewRenderContext {
  dataToDevice: Mat4;
  lightDirection: Vec3;
  ambientLighting: number;
  directionalLighting: number;
  pickIDs: PickIDManager;
  emitter: ShaderModule;
}

export class PerspectiveViewRenderLayer extends VisibilityTrackedRenderLayer {
  draw(renderContext: PerspectiveViewRenderContext) {
    // Must be overridden by subclasses.
  }

  drawPicking(renderContext: PerspectiveViewRenderContext) {
    // Do nothing by default.
  }

  /**
   * Should be rendered as transparent.
   */
  get isTransparent() { return false; }
}
