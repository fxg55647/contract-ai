Contract Graph Specification (Demo Version)
===========================================

Introduction
------------

This document describes the structure and editing principles of the contract logic graph used in the application.

The purpose of the graph is to represent contractual logic as a sequence of connected steps. The structure can later be used to generate contract text.

The specification intentionally keeps the model minimal. The goal is to support rapid prototyping and clear visualization rather than building a fully formal modeling system.

The design aims to ensure that the graph is easy to generate with AI and easy for users to understand and edit.

Design Principles
-----------------

The graph model follows several core principles.

The structure must remain simple and easy to understand. Users should be able to read the logic of the contract at a glance without needing to understand a complex modeling system.

The logic should primarily flow from top to bottom. Vertical flow makes the structure easier to read and prevents the layout from becoming excessively wide.

Nodes represent steps or states in the contract logic. Edges represent transitions between those steps.

The system should avoid unnecessary complexity in both the user interface and the underlying data model. The graph must remain directly editable by users so that it can be adjusted without requiring regeneration by AI.

To keep the system simple, the demo version intentionally excludes several features that might otherwise be present in a more advanced system. These include node types, edge labels, conditional edge metadata, and more complex graph semantics.

Such features may be introduced later if needed.

Graph Data Model
----------------

The graph consists of three main components: entry, nodes, and edges.

The entry field defines the starting node of the graph. It contains the identifier of the node where the contract logic begins.

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   "entry": "covenant_monitoring"   `

All nodes in the graph should ideally be reachable from the entry node so that the graph forms a coherent logical flow.

Nodes
-----

Nodes represent individual steps in the contract logic.

Each node contains three fields: id, name, and an optional description.

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   {    "id": "measure_leverage",    "name": "Measure Net Leverage",    "description": [      "Calculate net leverage ratio",      "Measurement occurs quarterly"    ]  }   `

### Node Fields

#### id

The id is a unique identifier used internally by the system.

Identifiers must be unique within the graph. They should be short, machine-friendly, and written in snake\_case format.

Examples of valid identifiers: measure\_leverage, equity\_cure, leverage\_breach, compliance\_restored

#### name

The name is the human-readable label displayed inside the node box in the user interface.

Node names should be short and easy to read, typically two to four words. The text must fit clearly within the node box. Long legal sentences should be avoided.

**Good examples:**

*   Measure Leverage
    
*   Leverage Test
    
*   Equity Cure
    
*   Compliance Restored
    
*   Leverage Breach
    

**Poor examples:**

*   Financial Maintenance Covenant Compliance Measurement Process
    
*   Net Leverage Ratio Must Be Calculated Quarterly And Compared To Threshold
    

#### description _(optional)_

The description field contains additional explanatory lines that clarify the logic of the node. Descriptions allow more detailed information to be included without making the node name too long.

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   "description": [    "Net leverage must not exceed 3.5x",    "Measured quarterly",    "Equity cure allowed once per 12 months"  ]   `

Edges
-----

Edges represent directed connections between nodes.

Each edge contains two fields: from and to.

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   {    "from": "measure_leverage",    "to": "leverage_test"  }   `

Edges represent transitions from one step in the contract logic to another. In the demo version, edges do not include labels or additional metadata. The meaning of the transition should be clear from the node names and the structure of the graph.

Example Graph
-------------

The following example illustrates a simple covenant monitoring flow.

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   {    "entry": "covenant_monitoring",    "nodes": [      {        "id": "covenant_monitoring",        "name": "Covenant Monitoring"      },      {        "id": "measure_leverage",        "name": "Measure Net Leverage"      },      {        "id": "leverage_test",        "name": "Leverage Test"      },      {        "id": "compliant",        "name": "Compliant"      },      {        "id": "leverage_breach",        "name": "Leverage Breach"      }    ],    "edges": [      { "from": "covenant_monitoring", "to": "measure_leverage" },      { "from": "measure_leverage",    "to": "leverage_test" },      { "from": "leverage_test",       "to": "compliant" },      { "from": "leverage_test",       "to": "leverage_breach" }    ]  }   `

Graph Layout Principles
-----------------------

### Node Spacing

Nodes should be spaced generously so that the graph is easy to read. A good rule of thumb is to leave roughly one node's worth of vertical space between connected nodes. Cramped layouts make the graph harder to follow and should be avoided.

### Primary Flow Direction

The graph should primarily flow from top to bottom. Users should be able to read the contract logic vertically.

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   Start    ↓   Step    ↓  Decision  ↙       ↘  Outcome A   Outcome B   `

The graph may spread horizontally when logically necessary, for example when a decision has multiple outcomes. The primary reading direction should remain top to bottom.

### Branching

Branches should reflect logical necessity. When a decision leads to multiple outcomes, each outcome should appear as a separate node connected by its own edge.

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   Leverage Test        ↓    Compliant   `

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   Leverage Test        ↓  Leverage Breach   `

Graph Editing (User Interface Behavior)
---------------------------------------

### Node Actions

Each node provides the following controls: **Add child** (create a new node directly connected below this one), **Edit** (modify the node name and description), **Delete** (remove the node), and **Create connection** (drag from the node to create a connection).

The **Add child** button (+) is the primary way to extend the graph step by step. It creates a new node positioned below the source node and automatically connects them with an edge. The new node receives a temporary name that the user can then edit.

### Creating Connections

Users create connections by dragging from a node. Two outcomes are possible.

**Connect to Existing Node** — if the connection is dropped on an existing node, an edge is created between the two nodes:

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   Node A → Node B   `

**Create New Node** — if the connection is dropped on empty space, a new node is automatically created and connected to the source node:

Plain textANTLR4BashCC#CSSCoffeeScriptCMakeDartDjangoDockerEJSErlangGitGoGraphQLGroovyHTMLJavaJavaScriptJSONJSXKotlinLaTeXLessLuaMakefileMarkdownMATLABMarkupObjective-CPerlPHPPowerShell.propertiesProtocol BuffersPythonRRubySass (Sass)Sass (Scss)SchemeSQLShellSwiftSVGTSXTypeScriptWebAssemblyYAMLXML`   Node A → New Node   `

The new node receives a temporary name such as New Step. The user can then edit the node.

### Edge Direction Convention

Edges should start from the bottom of the source node and end at the top of the target node. This applies both when dragging a connection manually and when using the plus button to create a child node. Following this convention keeps the graph visually consistent and makes the flow direction immediately clear.

### Deleting Connections

Clicking an edge selects it and reveals a delete button at the midpoint of the edge. Clicking the button removes the edge. This allows users to remove connections without deleting the nodes themselves.

### Connection Handles

Connection handles or plus icons should only appear when a node is hovered or selected. This keeps the graph visually clean and prevents the interface from becoming cluttered.

Graph Constraints
-----------------

To maintain a stable and readable structure, several simple constraints apply:

*   Node identifiers must be unique.
    
*   Duplicate edges should not be created.
    
*   Self-loops, where a node connects to itself, should be avoided.
    
*   All nodes should ideally remain reachable from the entry node so that the graph forms a single coherent flow.
    

AI Graph Generation Guidelines
------------------------------

When generating graphs from contract text, the AI should follow these guidelines:

*   Node names should be short and clear — long legal sentences should not be used as node titles.
    
*   Additional explanatory information should be placed in the description field.
    
*   The graph should prefer a vertical step-by-step structure rather than wide horizontal layouts.
    
*   All edges must reference valid node identifiers.
    
*   The resulting graph should be easy to visualize and easy for users to edit manually.
    

Future Extensions _(Not Included in Demo)_
------------------------------------------

Several features may be introduced later if the system evolves beyond the demo stage:

*   **Node types** — such as decision, action, or timer
    
*   **Labeled edges** — describing conditions or triggers
    
*   **Validation rules** — for graph correctness
    
*   **Logic simulation** — for simulating contract logic
    

These features are intentionally excluded from the demo version in order to keep the system simple, predictable, and easy to use during early development.