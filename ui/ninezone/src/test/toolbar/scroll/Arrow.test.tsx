/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
import { mount, shallow } from "enzyme";
import * as React from "react";

import { Chevron, Direction } from "../../../ui-ninezone";

describe("<Chevron />", () => {
  it("should render", () => {
    mount(<Chevron direction={Direction.Left} />);
  });

  it("renders correctly", () => {
    shallow(<Chevron direction={Direction.Left} />).should.matchSnapshot();
  });
});
