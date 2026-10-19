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

/**
 * Google Cloud service implementations.
 *
 * Exposes the settings of the Google Cloud environment a job runs in. Dedicated subpath modules provide implementations
 * of the shared services a job relies on, backed by Google Cloud facilities, to be bound in place of the defaults for
 * the duration of an execution, with no configuration beyond the ambient Google Cloud credentials.
 *
 * @module index
 */

import { immutable } from "@metreeca/core/values";
import { getGCPResidency } from "gcp-metadata";
import { GoogleAuth } from "google-auth-library";


/**
 * Values of the {@link gcp} settings, each resolved on first access and kept for the lifetime of the process.
 */
const cache: { -readonly [K in keyof typeof gcp]?: typeof gcp[K] } = {};


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * The Google Cloud Platform execution environment.
 *
 * Exposes the ambient settings shared by the Google Cloud integrations, such as whether the process is deployed to a
 * Google Cloud runtime, which port its HTTP service listens on and which project it runs in. Each setting is resolved
 * on first access and retained afterwards, so later changes to the environment of the process are not reflected.
 *
 * @see {@link https://cloud.google.com/docs/authentication Google Cloud Authentication}
 */
export const gcp = immutable({

	/**
	 * Whether the current process is running on Google Cloud.
	 *
	 * The flag is set for a process deployed to Cloud Run, Cloud Functions, App Engine, Google Kubernetes Engine or
	 * Compute Engine. It is cleared for a process running locally, such as a development server or a test runner.
	 *
	 * @see {@link https://cloud.google.com/run/docs/container-contract#env-vars Cloud Run environment variables}
	 * @see {@link https://cloud.google.com/appengine/docs/standard/nodejs/runtime#environment_variables App Engine environment variables}
	 */
	get cloud(): boolean {

		return cache.cloud ??= getGCPResidency() || Boolean(process.env.GAE_SERVICE);

	},

	/**
	 * The port an HTTP service is expected to listen on.
	 *
	 * The port is read from the `PORT` environment variable, which managed Google Cloud runtimes set to the port they
	 * route requests to; it defaults to `8080` if the variable is unset or empty.
	 */
	get port(): number {

		return cache.port ??= Number(process.env.PORT || 8080);

	},

	/**
	 * The ID of the Google Cloud project the process runs in.
	 *
	 * On a Google Cloud runtime the project is the one the process is deployed to; locally it is the one selected by
	 * the application default credentials or by the `gcloud` configuration. The promise rejects if no project is
	 * configured for the process.
	 */
	get project(): Promise<string> {

		return cache.project ??= new GoogleAuth().getProjectId();

	}

});
