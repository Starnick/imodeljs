/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Table */

import * as React from "react";
import { getDisplayName } from "@bentley/ui-core";
import { DropTargetArguments, DragSourceArguments, DropTargetProps, DragSourceProps } from "../../dragdrop/DragDropDef";
import { withDropTarget } from "../../dragdrop/withDropTarget";
import { TableProps, TableRowProps, TableRow } from "../component/Table";
import { RowItem, TableDataProvider } from "../TableDataProvider";
import { TableWrapper, TableWrapperProps } from "./TableWrapper";
import { DragDropRow } from "./DragDropRow";

/** Properties for the Table's DropTarget. */
export interface TableDropTargetProps<DragDropObject = any> extends DropTargetProps<DragDropObject> {
  /** Used for table components that allow dropping on top of node(as opposed to above or below). */
  canDropOn?: boolean;
}
/**
 * Type for DragDrop drag item
 */
export type TableDragDropType = {} | RowItem | TableDataProvider;

/**
 * Props that are injected to the HOC component.
 */
export interface TableDragDropProps<DragDropObject = any> {
  dragProps?: DragSourceProps<DragDropObject>;
  dropProps?: TableDropTargetProps<DragDropObject>;
}

/**
 * A HOC component that adds drag and drop functionality to the supplied
 * table component.
 */
// tslint:disable-next-line: variable-name naming-convention
export function withTableDragDrop<P extends TableProps, DragDropObject extends TableDragDropType>(TableComponent: React.ComponentType<P>): React.ComponentType<P & TableDragDropProps<DragDropObject>> {

  type CombinedProps = P & TableDragDropProps<DragDropObject>;

  // tslint:disable-next-line:variable-name
  return class WithDragAndDrop extends React.Component<CombinedProps> {

    public static get displayName() { return `WithDragAndDrop(${getDisplayName(TableComponent)})`; }

    public createDragProps(item: RowItem): DragSourceProps<DragDropObject> {
      if (!this.props.dragProps)
        return {};

      const { onDragSourceBegin, onDragSourceEnd, objectType } = this.props.dragProps as DragSourceProps;
      const dragProps: DragSourceProps<DragDropObject> = {
        onDragSourceBegin: (args: DragSourceArguments<DragDropObject>): DragSourceArguments<DragDropObject> => {
          args.dataObject = item.extendedData as DragDropObject;
          args.parentObject = this.props.dataProvider as DragDropObject;
          return onDragSourceBegin ? onDragSourceBegin(args) : args;
        },
        onDragSourceEnd: (args: DragSourceArguments<DragDropObject>) => {
          // istanbul ignore else
          if (onDragSourceEnd) {
            args.parentObject = this.props.dataProvider as DragDropObject;
            onDragSourceEnd(args);
          }
        },
        objectType: () => {
          // istanbul ignore else
          if (objectType) {
            if (typeof objectType === "function")
              return objectType(item.extendedData as DragDropObject);
            else
              return objectType;
          } else return "";
        },
      };
      return dragProps;
    }

    public createDropProps(): TableDropTargetProps<DragDropObject> {
      if (!this.props.dropProps)
        return {};

      const { canDropOn, onDropTargetOver, onDropTargetDrop, canDropTargetDrop, objectTypes } = this.props.dropProps as TableDropTargetProps;
      const dropProps: TableDropTargetProps<DragDropObject> = {
        canDropOn,
        onDropTargetOver: (args: DropTargetArguments<DragDropObject>) => {
          // populate table information while it's accessible
          args.dropLocation = this.props.dataProvider as DragDropObject;
          // istanbul ignore else
          if (onDropTargetOver) onDropTargetOver(args);
        },
        onDropTargetDrop: (args: DropTargetArguments<DragDropObject>): DropTargetArguments<DragDropObject> => {
          // populate table information while it's accessible
          args.dropLocation = this.props.dataProvider as DragDropObject;
          if (onDropTargetDrop) return onDropTargetDrop(args);
          return args;
        },
        canDropTargetDrop: (args: DropTargetArguments<DragDropObject>) => {
          // populate table information while it's accessible
          args.dropLocation = this.props.dataProvider as DragDropObject;
          if (canDropTargetDrop) return canDropTargetDrop(args);
          return true;
        },
        objectTypes,
      };
      return dropProps;
    }

    public renderRow = (item: RowItem, props: TableRowProps): React.ReactNode => {
      const baseNode = this.props.renderRow ? /* istanbul ignore next */ this.props.renderRow(item, props) : <TableRow key={item.key} {...props} />;
      const DDRow = DragDropRow<DragDropObject>(); // tslint:disable-line:variable-name
      return (
        <DDRow
          key={item.key}
          dragProps={this.createDragProps(item)}
          dropProps={this.createDropProps()}
          {...props}
        >
          {baseNode}
        </DDRow>
      );
    }
    public render() {
      const { dragProps, dropProps, renderNode, ...tableProps } = this.props as any;
      const DragDropWrapper = withDropTarget<TableWrapperProps, DragDropObject>(TableWrapper); // tslint:disable-line:variable-name
      return (
        <DragDropWrapper
          dropStyle={{ height: "100%" }}
          dropProps={this.createDropProps()}
        >
          <TableComponent {...tableProps}
            renderRow={this.renderRow} />
        </DragDropWrapper>
      );
    }

  };
}
export default withTableDragDrop;
