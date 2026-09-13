#
# Copyright © 2026 Metreeca srl
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#

# Link every external @metreeca dependency: a package left installed from the registry is loaded as a second copy of
# the module the linked packages load, and a service keyed on a symbol it exports never matches the binding a consumer
# registers

npx link \
  ../Core \
  ../Tape \
  ../Flow \
  ../HTTP
