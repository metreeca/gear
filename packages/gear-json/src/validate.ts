/*
 * Copyright © 2026 Metreeca srl
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { Value } from "@metreeca/core";
import type { Validator } from "@metreeca/core/trace";
import type { Task } from "@metreeca/flow";
import { filter } from "@metreeca/flow/tasks";
import { log } from "@metreeca/tape";


const logger = log(import.meta.url);


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Creates a value validation task.
 *
 * The generated task retains the values a validator accepts and drops the ones it reports violations for, so that a
 * consumer works on values already known to meet the constraints it expects.
 *
 * > [!NOTE]
 * >
 * > - **Incremental**: each retained value is emitted as soon as it is drawn, so the feed produced runs dry as the feed
 * >   drawn from does and an endless source is read as long as it is consumed.
 * > - **Streaming**: values are validated one at a time and none held, so the length of the feed weighs on memory no
 * >   more than a single value does.
 * > - **Stateless**: every value is validated on its own, so the outcome is unaffected by how the feed is split across
 * >   nested feeds or runs.
 *
 * > [!WARNING]
 * >
 * > A rejected value is dropped and reported to the log together with the trace listing every violation it incurs,
 * > leaving the feed to run to completion.
 *
 * @typeParam V The type of the validated values
 *
 * @param validator The validator applied to each value, reporting the trace of the violations the value incurs, or
 *                  nothing if it meets every constraint
 *
 * @returns A task retaining the values `validator` accepts
 *
 * @throws {@link !Error Error} While the feed is consumed, whatever the source reports while producing values, or
 *                             whatever `validator` reports while validating one
 *
 * @group Factories
 */
export function validate<V>(validator: Validator<V>): Task<V> {

	return filter(value => {

		const trace = validator(value);

		if ( trace === undefined ) {

			return true;

		} else {

			const id = "?"; // !!! from shape

			logger.warn`invalid <${id}> value (${JSON.stringify(trace)})`;

			return false;

		}

	});

}
