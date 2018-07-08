﻿import React from "react";
import { TypeChecker, Node, SourceFile, Symbol, Type, Signature, CompilerApi } from "../compiler";
import CircularJson from "circular-json";
import { css as cssConstants } from "../constants";
import { getSyntaxKindName, createHashSet } from "../utils";
import { LazyTreeView } from "./LazyTreeView";

export interface PropertiesViewerProps {
    api: CompilerApi;
    sourceFile: SourceFile;
    typeChecker: TypeChecker;
    selectedNode: Node;
}

export class PropertiesViewer extends React.Component<PropertiesViewerProps> {
    render() {
        const {selectedNode, sourceFile, typeChecker, api} = this.props;
        const keyValues = Object.keys(selectedNode).map(key => ({ key, value: selectedNode[key] }));
        return (
            <div className="propertiesViewer">
                <div className="container">
                    <h2>Node</h2>
                    <div id={cssConstants.properties.node.id}>
                        {getForNode(api, selectedNode, sourceFile)}
                    </div>
                    <h2>Type</h2>
                    <div id={cssConstants.properties.type.id}>
                        {getForType(api, selectedNode, typeChecker)}
                    </div>
                    <h2>Symbol</h2>
                    <div id={cssConstants.properties.symbol.id}>
                        {getForSymbol(api, selectedNode, typeChecker)}
                    </div>
                    <h2>Signature</h2>
                    <div id={cssConstants.properties.signature.id}>
                        {getForSignature(api, selectedNode, typeChecker)}
                    </div>
                </div>
            </div>
        );
    }
}

function getForNode(api: CompilerApi, selectedNode: Node, sourceFile: SourceFile) {
    return (<LazyTreeView nodeLabel={getSyntaxKindName(api, selectedNode.kind)} defaultCollapsed={false} getChildren={getChildren} />);

    function getChildren() {
        return (<>
            {getProperties(api, selectedNode)}
            {getMethodElement("getChildCount()", selectedNode.getChildCount(sourceFile))}
            {getMethodElement("getFullStart()", selectedNode.getFullStart())}
            {getMethodElement("getStart()", selectedNode.getStart(sourceFile))}
            {getMethodElement("getStart(sourceFile, true)", selectedNode.getStart(sourceFile, true))}
            {getMethodElement("getFullWidth()", selectedNode.getFullWidth())}
            {getMethodElement("getWidth()", selectedNode.getWidth(sourceFile))}
            {getMethodElement("getLeadingTriviaWidth()", selectedNode.getLeadingTriviaWidth(sourceFile))}
            {getMethodElement("getFullText()", selectedNode.getFullText(sourceFile))}
            {/* Need to do this because internally typescript doesn't pass the sourceFile to getStart() in TokenOrIdentifierObject (bug in ts) */}
            {getMethodElement("getText()", sourceFile.text.substring(selectedNode.getStart(sourceFile), selectedNode.getEnd()))}
        </>);
    }

    function getMethodElement(name: string, result: string | number) {
        return (
            <div className="method" key={name} data-name={name}>
                <span className="methodName">{name}:</span>
                <span className="methodResult">{typeof result === "string" ? JSON.stringify(result) : result}</span>
            </div>
        );
    }
}

function getForType(api: CompilerApi, node: Node, typeChecker: TypeChecker) {
    const type = getOrReturnError(() => typeChecker.getTypeAtLocation(node));
    if (node.kind === api.SyntaxKind.SourceFile)
        return (<>[None]</>);
    if (typeof type === "string")
        return (<>[Error getting type: {type}]</>);

    return getTreeView(api, type, getTypeToString() || "Type");

    function getTypeToString() {
        try {
            return typeChecker.typeToString(type as Type, node);
        } catch (err) {
            return `[Problem getting type text: ${err}]`;
        }
    }
}

function getForSymbol(api: CompilerApi, node: Node, typeChecker: TypeChecker) {
    const symbol = getOrReturnError(() => (node["symbol"] as Symbol | undefined) || typeChecker.getSymbolAtLocation(node));
    if (symbol == null)
        return (<>[None]</>);
    if (typeof symbol === "string")
        return (<>[Error getting symbol: {symbol}]</>);

    return getTreeView(api, symbol, getSymbolName() || "Symbol");

    function getSymbolName() {
        try {
            return (symbol as Symbol).getName();
        } catch (err) {
            return `[Problem getting symbol name: ${err}]`;
        }
    }
}

function getForSignature(api: CompilerApi, node: Node, typeChecker: TypeChecker) {
    const signature = getOrReturnError(() => typeChecker.getSignatureFromDeclaration(node as any));
    if (signature == null || typeof signature === "string")
        return (<>[None]</>);

    return getTreeView(api, signature, "Signature");
}

function getOrReturnError<T>(getFunc: () => T): T | string {
    try {
        return getFunc();
    } catch (err) {
        return JSON.stringify(err);
    }
}

function getTreeView(api: CompilerApi, rootItem: any, rootLabel: string) {
    return (<LazyTreeView nodeLabel={rootLabel} defaultCollapsed={false} getChildren={() => getProperties(api, rootItem)} />);
}

function getProperties(api: CompilerApi, rootItem: any) {
    let i = 0;
    return getNodeKeyValuesForObject(rootItem);

    function getTreeNode(value: any): JSX.Element {
        return (
            <LazyTreeView nodeLabel={getLabelName(value)} key={i++} defaultCollapsed={true} getChildren={() => getNodeKeyValuesForObject(value)} />
        );
    }

    function getNodeKeyValuesForObject(obj: any) {
        const keyValues = getObjectKeys(obj).map(key => ({ key, value: obj[key] }));

        const values = (
            <>
                {keyValues.map(kv => (getNodeValue(kv.key, kv.value, obj)))}
            </>
        );
        return values;
    }

    function getNodeValue(key: string, value: any, parent: any): JSX.Element {
        if (value === null)
            return (
                <div className="text" key={key} data-name={key}>
                    <div className="key">{key}:</div>
                    <div className="value">null</div>
                </div>);
        else if (value === undefined)
            return (
                <div className="text" key={key} data-name={key}>
                    <div className="key">{key}:</div>
                    <div className="value">undefined</div>
                </div>);
        else if (value instanceof Array) {
            if (value.length === 0)
                return (
                    <div className="text" key={key} data-name={key}>
                        <div className="key">{key}:</div>
                        <div className="value">[]</div>
                    </div>);
            else
                return (
                    <div className="array" key={key} data-name={key}>
                        <div className="key">{key}: [</div>
                        <div className="value">{value.map(v => getTreeNode(v))}</div>
                        <div className="suffix">]</div>
                    </div>);
        }
        else if (isTsNode(value))
            return (
                <div className="object" key={key} data-name={key}>
                    <div className="key">{key}: {"{"}</div>
                    <div className="value">{getTreeNode(value)}</div>
                    <div className="suffix">{"}"}</div>
                </div>);
        else if (typeof value === "object") {
            if (getObjectKeys(value).length === 0)
                return (
                    <div className="text" key={key} data-name={key}>
                        <div className="key">{key}:</div>
                        <div className="value">{"{}"}</div>
                    </div>);
            else
                return (
                    <div className="object" key={key} data-name={key}>
                        <div className="key">{key}: {"{"}</div>
                        <div className="value">{getTreeNode(value)}</div>
                        <div className="suffix">{"}"}</div>
                    </div>);
        }
        else
            return (
                <div className="text" key={key} data-name={key}>
                    <div className="key">{key}:</div>
                    <div className="value">{getCustomValue()}</div>
                </div>);

        function getCustomValue() {
            if (isTsNode(parent) && key === "kind")
                return `${value} (SyntaxKind.${getSyntaxKindName(api, value)})`;
            return CircularJson.stringify(value);
        }
    }

    function getObjectKeys(obj: any) {
        return Object.keys(obj).filter(key => isAllowedKey(obj, key));
    }

    function getLabelName(obj: any) {
        if (isTsNode(obj))
            return getSyntaxKindName(api, obj.kind);
        if (isTsSignature(obj))
            return appendName("Signature");
        if (isTsType(obj))
            return appendName("Type");
        return appendName("Object");

        function appendName(title: string) {
            const name = getName();
            return name == null ? title : title + ` (${name})`;
        }

        function getName() {
            try {
                if (typeof obj.getName === "function")
                    return obj.getName();
                return undefined;
            } catch {
                return undefined;
            }
        }
    }
}

const nodeDisallowedKeys = ["parent", "_children", "symbol"];
const typeDisallowedKeys = ["checker", "symbol"];
function isAllowedKey(obj: any, key: string) {
    if (isTsNode(obj))
        return nodeDisallowedKeys.indexOf(key) === -1;
    if (isTsType(obj))
        return typeDisallowedKeys.indexOf(key) === -1;
    return true;
}

function isTsNode(value: any): value is Node {
    return typeof (value as Node).kind === "number";
}

function isTsType(value: any): value is Type {
    return typeof (value as Type).getBaseTypes != null;
}

function isTsSignature(value: any): value is Signature {
    if (value.declaration == null)
        return false;
    return isTsNode(value.declaration);
}