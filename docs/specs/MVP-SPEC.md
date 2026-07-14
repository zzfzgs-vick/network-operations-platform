# 网络可观测与运营平台 MVP 统一规格

## 1. 文档状态和版本

| 项目 | 值 |
| --- | --- |
| 文档状态 | 已收敛，可用于 Ticket 拆分 |
| 规格版本 | 1.0.0 |
| 容量等级 | MVP-S1 |
| 基线日期 | 2026-07-13 |
| 变更方式 | 经 ADR 或正式规格变更评审后修订 |

本文件是 MVP Ticket、测试和发布验收的统一入口。详细算法、字段和运行约束由下列权威资料维护；本文件固定产品边界、依赖方向和可验收结果，不复制其全部细节。

### 1.1 规范级别和追踪规则

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-GEN-001 | 本规格中的“必须”和“不得”表示发布强制项，“应”表示仅可在 Ticket 中记录明确理由后偏离，“可以”表示可选能力；所有强制项必须以本文件的稳定需求编号追踪到 Ticket 和测试。适用于全部 MVP 工作。 | 抽查 Ticket、测试和发布清单；存在无编号的强制产品约束，或已实现能力无法追踪到需求编号，即失败。 | [CONTEXT](../CONTEXT.md)、[验收标准](mvp-acceptance.md) |
| MVP-GEN-002 | 需求编号一经发布不得因章节重排而复用或重编号；废止项应保留编号并标注替代关系。适用于规格维护。 | 规格差异审查；编号被复用或无替代记录消失，即失败。 | 本规格、[ADR 索引](../architecture/adr/README.md) |
| MVP-GEN-003 | 冲突必须按“已接受 ADR、CONTEXT 已决定、正式架构、产品范围、验收标准、说明文档”的顺序解决，且不得静默选择。适用于规格、Ticket 和实现评审。 | 冲突解决记录及 ADR 追踪；实现采用低优先级冲突内容且无记录，即失败。 | [CONTEXT](../CONTEXT.md)、本规格第 29 节 |

### 1.2 权威资料索引

| 简称 | 资料 |
| --- | --- |
| CTX | [项目上下文](../CONTEXT.md) |
| SCOPE | [MVP 范围](../product/mvp-scope.md) |
| CLOSURE | [决策收敛](../product/decision-closure.md) |
| DOMAIN | [领域模型](../domain/DOMAIN-MODEL.md) |
| ARC-CODE | [代码库设计](../architecture/codebase-design.md) |
| ARC-RUN | [平台运行时](../architecture/platform-runtime.md) |
| ARC-AUTH | [认证与授权](../architecture/authentication-authorization.md) |
| ARC-ALT | [告警与事件](../architecture/alerts-incidents.md) |
| ARC-HLT | [健康模型](../architecture/health-model.md) |
| ARC-CAP | [容量与性能](../architecture/capacity-performance.md) |
| ARC-DEP | [MVP 部署](../architecture/mvp-deployment.md) |
| ACC | [MVP 验收标准](mvp-acceptance.md) |
| CAP-ACC | [MVP-S1 容量验收](mvp-s1-capacity-acceptance.md) |

十三份已接受 ADR 位于 [ADR 目录](../architecture/adr/README.md)，其覆盖关系见第 26 节。

## 2. 产品目标

平台替代已停止维保的旧安全管理平台核心功能，面向几百台交换机、服务器和其他基础设施设备，形成“领导宏观视角 + 运维微观视角”的统一网络可观测与运营能力。

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-GEN-004 | MVP 必须同时交付领导聚合视图和运维诊断处置视图，并以同一组资产、拓扑、Condition、Health、Alert 和 Incident 权威数据为基础。 | 端到端验收；任一视图缺失，或两套视图维护互相矛盾的状态，即失败。 | CTX、SCOPE、ACC |
| MVP-GEN-005 | MVP 必须覆盖设备与接口纳管、核心线路与业务路径、主动探测、SNMP 采集与 Trap、分层拓扑、健康、告警和事件处置。 | 功能验收矩阵；任一核心能力没有可执行验收路径，即失败。 | SCOPE、ACC |
| MVP-GEN-006 | 平台必须优先保证身份、权限、配置一致性、核心采集和告警事实；不得为展示便利把未知、过期或受抑制状态表达为正常。 | 故障注入、权限绕过和陈旧数据测试；出现误报正常或安全降级放行，即失败。 | ADR-0011、ADR-0013、ACC |

## 3. 背景和问题定义

现有平台停止维保，无法继续作为可靠的资产、拓扑、监测和处置基础。新平台需要在单中心、单主机、有限团队可维护的前提下，先恢复核心网络运行可见性，再为未来分布式采集和更高容量保留清晰边界。MVP 解决“看得见、辨得清、能处置、可恢复”的问题，不承担全功能 CMDB、ITSM 或安全分析平台职责。

## 4. 用户角色

| 角色 | 核心职责 | 默认边界 |
| --- | --- | --- |
| System Administrator | 系统配置、用户和权限、Collector、认证安全、审计 | 敏感权限触发 TOTP |
| Network Administrator | 资产、接口、线路、探测、拓扑确认、网络告警 | 默认不管理系统管理员或认证安全 |
| Operator | 查看状态、确认告警、维护事件处置记录、授权重探测 | 不修改凭据、正式拓扑或用户 |
| Auditor | 只读审计、配置变化、身份确认、告警处置、备份恢复记录 | 无业务修改权限 |
| Executive Viewer | 领导大屏、聚合健康、线路可用率、重大事件和趋势 | 无敏感设备详情和配置权限 |

角色是默认权限模板，授权判定以权限集合为准。

## 5. MVP 范围

MVP 范围包括：本地安全认证与最小 RBAC；资产和接口身份；受控 CSV 导入；SNMPv2c/v3、Trap、TCP/ICMP/HTTP/DNS；Desired/Observed/Effective State；候选拓扑确认；共享 Condition；Health；Alert/Incident；领导大屏和运维工作台；单主机部署、备份恢复；MVP-S1 容量验收。

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-GEN-007 | MVP 范围必须以本规格和 SCOPE 的交集为发布边界；新增基础设施或产品能力必须通过新的 ADR 或规格变更进入范围。 | 发布范围审查；未经决策即引入新组件或能力，即失败。 | SCOPE、CLOSURE、ACC |
| MVP-GEN-008 | 第一版实现必须保持模块化单体和最小生产组件集合，不得以未来微服务化为由预建分布式接口、Broker 或重复权威状态。 | 架构和依赖审查；出现无当前用途的服务拆分或第二权威状态，即失败。 | ARC-CODE、ADR-0013 |

## 6. 明确非目标

下列条目是第一版明确排除的能力，其编号用于 Ticket 范围检查。

| 编号 | MVP 非目标与禁止边界 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-GEN-101 | MVP 不得实现分布式站点 Collector、远程节点注册、节点证书签发、mTLS、离线补传、自动升级或多节点高可用。 | 架构和依赖清单；出现相应运行组件或协议，即失败。 | ADR-0001、SCOPE |
| MVP-GEN-102 | MVP 不得实现 Kubernetes、Docker Swarm、双机热备、自动故障转移或跨机房灾备。 | 部署产物审查；出现编排或 HA 配置，即失败。 | ADR-0004、ARC-DEP |
| MVP-GEN-103 | MVP 不得引入 Redis、NATS、Kafka、RabbitMQ、BullMQ、Temporal 或 NestJS 微服务传输作为状态、会话或任务协调组件。 | 依赖和运行组件审查；出现上述组件，即失败。 | ADR-0013、ARC-RUN |
| MVP-GEN-104 | MVP 不得把 Alertmanager 放入 Alert Instance、Silence、Incident 或人工处置的权威链路。 | 数据流和恢复测试；平台历史依赖 Alertmanager 才可恢复，即失败。 | ADR-0010、ARC-ALT |
| MVP-GEN-105 | MVP 不得建设完整 ITSM、复杂排班、聊天室、视频会议或外部工单双向同步。 | 功能清单审查；相应模块进入发布范围，即失败。 | ADR-0009、SCOPE |
| MVP-GEN-106 | MVP 不得实现机器学习根因分析、黑盒健康评分、概率身份合并或无法解释的自动事件归并。 | 模型和算法审查；权威状态无法给出确定性依据，即失败。 | ADR-0003、ADR-0009、ADR-0011 |
| MVP-GEN-107 | MVP 不得实现 Syslog、NetFlow、流量安全分析或完整安全运营能力。 | 采集协议和页面清单；相应能力被列为 MVP 验收项，即失败。 | CTX、SCOPE |
| MVP-GEN-108 | MVP 不得实现无人值守 kiosk、Display Session、自动登录、永久会话、URL Token 或免认证大屏。 | 认证和大屏验收；存在旁路或长期展示凭据，即失败。 | ADR-0007、SCOPE、ACC |
| MVP-GEN-109 | MVP 不得接入 AD、LDAP、OIDC、SAML、Keycloak、SCIM 或外部目录同步。 | 认证提供者和依赖审查；本地认证之外的提供者进入运行链路，即失败。 | ADR-0005、ARC-AUTH |
| MVP-GEN-110 | MVP 不得实现 WebAuthn/FIDO2、短信、邮件或 Push MFA，也不得绑定多个同时有效的 TOTP 设备。 | 认证功能验收；出现未批准因素，即失败。 | ADR-0006、ARC-AUTH |
| MVP-GEN-111 | MVP 不得自动修改网络设备配置或根据发现结果无人审批地重构正式拓扑。 | 设备交互和拓扑审计；出现写设备配置或自动提升正式关系，即失败。 | ADR-0002、SCOPE |
| MVP-GEN-112 | MVP 不得允许任意用户脚本、任意生产 YAML 或重复 MetricsQL 作为 Condition 或告警条件。 | 规则输入和发布审查；存在脚本执行、直接文件覆盖或重复条件定义，即失败。 | ADR-0010、ADR-0012 |
| MVP-GEN-113 | MVP 不得把 30,000 个接口同时渲染为默认拓扑节点，也不得承诺未经验证的并发和时间序列规模。 | 前端容量和产品声明审查；全量接口图或超范围承诺，即失败。 | ADR-0008、ARC-CAP |
| MVP-GEN-114 | MVP 不得实现 PostgreSQL 自动主从、VictoriaMetrics 集群、多个 vmalert 高可用副本或多中心规则执行。 | 部署拓扑审查；出现集群和自动切换，即失败。 | ADR-0004、ADR-0010 |
| MVP-GEN-115 | MVP 不得实现复杂 CMDB 双向同步、多外部数据源优先级编排或自动修复资产数据。 | 导入和集成验收；外部系统可无审批改写权威数据，即失败。 | ADR-0002、ADR-0003 |

## 7. 系统边界

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-ARC-001 | 开发环境必须支持 Windows 11、Node.js 24 LTS 和当前稳定 Go；生产环境必须是 Ubuntu Server 24.04 LTS、Docker Engine 与 Docker Compose Plugin。 | 环境矩阵构建和部署验证；仅在开发机可运行或生产依赖 Windows 路径，即失败。 | CTX、ARC-CODE、ARC-DEP、ACC |
| MVP-ARC-002 | 生产必须采用单台主机、单实例 PostgreSQL 和单节点 VictoriaMetrics，且必须明确为非高可用、人工恢复部署。 | 部署说明和故障演练；把容器重启描述为主机级 HA，或存在未声明自动切换，即失败。 | ADR-0004、ARC-DEP、ACC |
| MVP-ARC-003 | 平台必须采用模块化单体：React、TypeScript、Vite、Ant Design Web，NestJS HTTP API，NestJS Platform Worker，Go Collector 服务，PostgreSQL，VictoriaMetrics 和 vmalert 构成生产运行边界；图表使用 Apache ECharts，拓扑优先评估 AntV G6。 | 运行组件和前端技术清单；缺少核心组件、替换已决定技术栈或引入未批准组件，即失败。 | CTX、ARC-CODE、ARC-RUN、ADR-0013 |
| MVP-ARC-004 | PostgreSQL 必须是业务权威状态和可靠工作协调源；VictoriaMetrics 必须是时序事实存储；vmalert 必须执行 Metric Condition。三者不得互相替代职责。 | 数据恢复和故障注入；Incident 仅存在于时序库、指标仅以 PostgreSQL 为主存储或 API 自行扫描指标，即失败。 | ADR-0010、ADR-0012、ADR-0013 |
| MVP-ARC-005 | MVP 必须采用单中心采集并创建内置 `central-default`；领域、任务和结果必须保留 Collector/ProbeNode 身份，但不得实现远程节点生命周期。 | 领域、接口和默认数据验收；采集结果无来源，或出现站点节点注册功能，即失败。 | ADR-0001、DOMAIN、ACC |
| MVP-ARC-006 | Web、API、Worker、Go 和 vmalert 之间必须只通过明确协议、共享应用服务或持久工作记录协作；前端不得直接依赖 Go、vmalert 或数据库。 | 依赖图和集成测试；存在前端直连采集器、Worker 调自身公开 API 或 Go 直写业务表，即失败。 | ARC-CODE、ARC-RUN、ADR-0013 |

## 8. 运行时组件

```text
同源 HTTPS 入口
├── React Web
├── NestJS HTTP API
│   └── SSE 连接与权限过滤
├── NestJS Platform Worker
│   ├── Inbox / Outbox / Job Queue
│   ├── Condition / Health / Alert
│   └── Reconciliation / Notification
├── Go Collector
│   ├── SNMP / Probe
│   └── Trap Receiver
├── PostgreSQL
├── VictoriaMetrics
└── vmalert
```

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-ARC-007 | HTTP API 和 Platform Worker 必须从同一 NestJS 代码库以独立入口、独立进程和独立容器运行；Worker 不得启动用户 HTTP Listener。 | 进程启动和端口扫描；两者共用唯一进程或 Worker 暴露用户 API，即失败。 | ADR-0013、ARC-CODE、ARC-RUN、ACC |
| MVP-ARC-008 | HTTP API 必须负责认证、授权、同步命令、查询和 SSE；不得在请求内执行长时间 Condition、Health 全量重算、周期对账或批量通知。 | 请求时限、进程职责和故障注入；请求线程承担后台循环或外部通知阻塞事务，即失败。 | ADR-0013、ARC-RUN、ACC |
| MVP-ARC-009 | Platform Worker 必须负责可靠异步处理、Condition/Health/Alert、对账、Outbox、通知、过期判定和清理；不得通过调用自身公开 API 执行业务逻辑。 | Worker 集成测试；后台状态依赖用户 API 可用或鉴权旁路，即失败。 | ADR-0013、ARC-RUN |
| MVP-ARC-010 | Go Collector 必须负责协议通信、协议级解析、Observation/Fact 提交、批处理和重试；不得决定最终 Health、Alert、Incident、维护或业务权限。 | 协议与领域边界测试；Go 输出权威健康或直接修改人工状态，即失败。 | ADR-0001、ADR-0013、DOMAIN |
| MVP-ARC-011 | 公共协议必须在 `packages/contracts` 维护权威 OpenAPI/JSON Schema 并生成 TypeScript/Go 类型；生成物不得成为独立手工编辑的第二权威定义。 | 代码库设计验收；跨语言 DTO 手工漂移或生成物被直接修改，即失败。 | ARC-CODE |
| MVP-ARC-012 | 数据库迁移必须由显式单次入口串行执行，API、Worker 和 Go 服务启动时不得各自隐式迁移；全部业务表使用一条全局迁移历史。 | 启动并发和回滚演练；多个进程竞争迁移或模块拥有不一致迁移流，即失败。 | ARC-CODE、ARC-DEP |

## 9. 领域与数据原则

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-AST-001 | 资产和拓扑必须区分 Desired State、Observed State 与 Effective State；已确认 Desired State 必须优先，Observed State 不得静默覆盖 Effective State。 | 差异、冲突和审计测试；采集结果移动、删除或替换权威数据，即失败。 | ADR-0002、DOMAIN、ACC |
| MVP-AST-002 | 字段所有权必须按字段记录来源、确认和锁定状态，不得把整个设备对象简单归为“人工”或“发现”。 | 字段级冲突和导入测试；任一观测字段可无审批覆盖锁定值，即失败。 | ADR-0002、DOMAIN |
| MVP-AST-003 | 已发现对象和关系消失时必须保留最后观测、转为 STALE/MISSING 并保留审计；不得以自动物理删除表达未再次发现。 | 设备离线和接口变化测试；历史对象或关系被静默删除，即失败。 | ADR-0002、ACC |

## 10. 资产与身份

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-AST-004 | `managedDeviceId`、`deviceInstanceId`、`interfaceId` 和 `topologyRelationId` 必须由平台生成、创建后不可变，并作为历史指标、告警和审计引用。 | 身份生命周期测试；ID 因名称、IP、序列号、MAC 或 ifIndex 变化而重算，即失败。 | ADR-0003、DOMAIN、ACC |
| MVP-AST-005 | Managed Device 必须表示逻辑职责，Device Instance 必须表示一次硬件实例；确认硬件替换必须保留 managedDeviceId、退役旧实例、创建新实例和追加审计。 | 硬件替换场景；新旧序列号和运行历史被合并或旧历史丢失，即失败。 | ADR-0003、DOMAIN |
| MVP-AST-006 | 自动设备匹配必须仅接受唯一且无冲突的强证据；IP、名称、sysName、单一序列号、单一 MAC 和 ifIndex 不得单独触发正式合并。 | 模糊身份、异常序列号和 IP 复用测试；低置信度自动合并，即失败。 | ADR-0003、ACC |
| MVP-AST-007 | 接口正式身份必须使用不可变 interfaceId；ifIndex 必须作为原始观测属性，并结合接口类型、槽位端口、名称、LLDP、MAC、聚合或逻辑参数匹配。 | 设备重启、ifIndex 变化和接口类型测试；重复创建大量接口或错误合并，即失败。 | ADR-0003、DOMAIN、CAP-ACC |
| MVP-AST-008 | 身份合并、拆分、替换、重新绑定和撤销必须保留原始 ID、重定向、证据、原因、操作者和时间；不得物理删除合并前历史。 | 审计与撤销测试；无法还原错误合并或追溯依据，即失败。 | ADR-0003、ACC |
| MVP-AST-009 | CSV 导入必须提供校验、预览、差异、批次、幂等标识、错误行、确认、审计和撤销能力；不得按名称或管理 IP 默认覆盖现有设备。 | 导入重放、冲突和撤销测试；重复导入产生重复身份或无预览覆盖，即失败。 | ADR-0002、ADR-0003、SCOPE |
| MVP-AST-010 | 设备、接口、线路和拓扑关系的归档必须保留历史引用；普通业务操作不得物理删除已被指标、告警、Incident 或审计引用的身份。 | 归档后历史查询；引用断裂或历史页面不可解释，即失败。 | DOMAIN、ADR-0003 |
| MVP-AST-011 | 身份模型必须支持堆叠、虚拟机框和同一管理 IP 下多个物理成员；成员替换、编号变化和主备切换必须形成差异或实例变化，不得静默改写历史身份。 | 堆叠成员变化测试；系统假定一条管理 IP 永远对应一台物理设备，即失败。 | ADR-0003、DOMAIN |

## 11. 采集和主动探测

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-COL-001 | MVP 必须支持 SNMPv2c 兼容采集和 SNMPv3 默认安全模式，并支持接口状态、计数器、设备资源、库存及 LLDP 候选邻接。 | 协议集成和真实厂商抽样；SNMPv3 缺失或仅能采集单一厂商，即失败。 | CTX、SCOPE、ACC、CAP-ACC |
| MVP-COL-002 | MVP 必须支持 TCP Connect、ICMP、HTTP/HTTPS 和 DNS 主动探测，探测任务必须具有稳定身份、周期、超时、优先级、目标和 collectorId。 | 四类探测端到端测试；结果无法追踪任务和采集节点，即失败。 | CTX、DOMAIN、CAP-ACC |
| MVP-COL-003 | SNMP 任务、主动探测任务和结果必须携带 collectorId/probeNodeId；设备和目标必须可关联首选节点，MVP 默认均指向 `central-default`。 | 接口契约和默认配置测试；来源为空或控制面假设采集进程与 API 同主机，即失败。 | ADR-0001、ACC |
| MVP-COL-004 | 采集调度必须使用抖动、超时隔离、设备级并发限制、优先级和失败退避；不得让单个慢目标阻塞其他目标或形成请求风暴。 | 慢设备、超时和压力测试；关键任务饥饿或重试风暴，即失败。 | ARC-CAP、CAP-ACC |
| MVP-COL-005 | Trap Receiver 必须验证来源、解析并规范化事件、保留安全摘要并可触发补充轮询；linkUp/linkDown 不得在缺乏身份和状态确认时无条件恢复或触发正式状态。 | Trap 丢失、乱序和补充轮询测试；单个 Trap 改写不匹配 Episode，即失败。 | ADR-0010、ARC-ALT、ACC |
| MVP-COL-006 | 主动探测结果必须写入时序存储并由共享 Metric Condition 处理连续失败、丢包、延迟和窗口；调度器内部故障必须形成 Platform Event。 | 数据流集成测试；探测器自行维护 Alert 生命周期或执行器故障被当作目标恢复，即失败。 | ADR-0010、ADR-0012 |
| MVP-COL-007 | Collector、任务执行和结果提交必须可观测，至少覆盖成功、失败、超时、重试、队列、最老等待时间和数据新鲜度；不得把长时间无数据显示为正常。 | 故障注入和运维页面验收；采集停止后状态仍为健康，即失败。 | ARC-CAP、ARC-HLT、ACC |

## 12. Observation、Normalized Fact 和 Condition

权威数据流：

```text
Observation / Metric
        ↓
Normalized Fact / Metric
        ↓
Condition Evaluation
        ├──→ Alert Engine
        └──→ Health Engine
```

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-OBS-001 | 每条 Observation 必须保留 sourceType、collectorId、observedAt、有效期、confidence、原始标识或原始值，并在可确定时关联 managedDeviceId、deviceInstanceId、interfaceId 和原始 ifIndex。 | 协议与存储契约测试；观测无法追踪来源、时间或身份匹配版本，即失败。 | ADR-0001、ADR-0002、ADR-0003、DOMAIN |
| MVP-OBS-002 | Observation Normalizer 必须把协议字段转为版本化 Normalized Fact；不得在协议解析器、API 或页面分别解释同一事实。 | 跨协议一致性测试；同一输入在不同消费者产生不同语义，即失败。 | ADR-0012、DOMAIN |
| MVP-OBS-003 | 身份未确认的观测必须进入候选或歧义状态，不得错误写入正式设备、接口的历史指标或状态。 | 模糊身份和重复提交测试；候选数据污染正式历史，即失败。 | ADR-0003、ACC |
| MVP-OBS-004 | 指标标签必须使用受控稳定身份和有限状态值；不得使用请求 ID、Trace ID、会话 ID、用户 ID、完整错误、原始 Trap 全文或其他无界值。 | 标签基数审查和容量报告；出现无界标签或超过预算未评审，即失败。 | ADR-0008、ARC-CAP、CAP-ACC |
| MVP-OBS-005 | 数据新鲜度和来源可用性必须由共享 Fact/Condition 层统一计算，不得由 Alert、Health、报表或前端各自重复比较时间戳。 | 条件定义和故障注入；同一 staleAfter 在多处维护或来源故障被解释为 FALSE，即失败。 | ADR-0012、ARC-HLT |
| MVP-CND-001 | Condition Definition 必须具有不可变 conditionId、版本、执行绑定、依赖、目标维度和配置哈希；Condition Evaluation 必须使用 TRUE、FALSE、UNKNOWN 三值状态。 | 领域和状态转换测试；只存布尔值或版本不可追踪，即失败。 | ADR-0012、DOMAIN、ACC |
| MVP-CND-002 | MetricsQL、阈值、进入/退出窗口、迟滞、新鲜度前提、聚合和结果维度必须只在一个 Condition Version 中定义；Alert Rule、Health Policy、API、Go 和前端不得复制同一条件。 | 定义扫描和阈值变更测试；修改同一业务阈值需要更新多处权威定义，即失败。 | ADR-0012、ARC-HLT、ARC-ALT |
| MVP-CND-003 | Alert Rule 与 Health Policy 必须通过绑定消费同一活动 Condition Version；Health Engine 不得读取 Alert Instance，Alert Engine 不得读取最终 Health Status 来重复计算同一异常。 | 依赖图和集成测试；出现 Health→Alert→Health 循环或版本漂移，即失败。 | ADR-0012、ACC |
| MVP-CND-004 | Condition 依赖必须构成有向无环图；ALL、ANY、NOT、QUORUM、SEQUENCE 和 DEPENDENCY 组合必须定义 UNKNOWN 传播，且不得把 UNKNOWN 当作 FALSE。 | 循环检测和三值真值表测试；循环配置被接受或 UNKNOWN 导致恢复，即失败。 | ADR-0012、ACC |
| MVP-CND-005 | Metric Condition 必须由 vmalert 执行；Direct Fact Condition 必须由平台基于 Normalized Fact 执行；两类结果必须规范化为同一 Condition Evaluation。 | 执行器集成测试；NestJS 扫描全部指标或 vmalert处理直接人工状态，即失败。 | ADR-0010、ADR-0012 |
| MVP-CND-006 | Condition Evaluation 必须包含 condition/version、目标、维度、状态、评估和接收时间、有效期、来源、执行状态、值/阈值摘要、证据和配置哈希，并具有稳定幂等身份。 | 重复、并发和乱序结果测试；周期评估重复创建业务转换，即失败。 | ADR-0012、DOMAIN |
| MVP-CND-007 | Condition 发布必须校验语法、依赖环、单元测试、配置哈希和执行器加载，并原子切换消费者版本；发布失败时 Alert 与 Health 必须共同继续使用上一有效版本。 | 发布失败、回滚和版本一致性测试；一方使用新版本另一方使用旧版本且无受控迁移记录，即失败。 | ADR-0010、ADR-0012、ACC |
| MVP-CND-008 | 当前 Condition Evaluation 必须预计算并持久化必要业务状态；页面和 Health API 不得在请求时全量执行表达式或扫描原始指标。 | 性能剖析和请求路径检查；页面请求触发全量 MetricsQL 条件计算，即失败。 | ADR-0012、ARC-CAP、CAP-ACC |
| MVP-CND-009 | 执行错误、数据过期、来源不可用、版本未部署、哈希不匹配、结果超限或身份歧义必须产生 UNKNOWN；不得解释为 FALSE、健康或告警恢复。 | 故障矩阵测试；故障导致 Alert Resolved 或 Health HEALTHY，即失败。 | ADR-0010、ADR-0011、ADR-0012、ACC |

## 13. Health

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-HLT-001 | 权威 Health Status 必须且只能为 HEALTHY、DEGRADED、CRITICAL、UNKNOWN；Operational Mode 和 Data Quality 必须是独立维度。 | 枚举与组合状态测试；MAINTENANCE 被加入互斥健康枚举或质量覆盖健康事实，即失败。 | ADR-0011、ARC-HLT、ACC |
| MVP-HLT-002 | Operational Mode 必须覆盖 ACTIVE、MAINTENANCE、DISABLED、RETIRED；维护期间必须继续采集、计算和保存底层健康及 Alert，不得把维护对象伪装为 HEALTHY。 | 维护窗口测试；维护使红色事实消失或停止评估，即失败。 | ADR-0011、ARC-HLT |
| MVP-HLT-003 | Data Quality 必须覆盖 FRESH、PARTIAL、STALE、SOURCE_UNAVAILABLE、CONFLICTING、NOT_CONFIGURED；关键输入不足时 Health 必须为 UNKNOWN。 | 数据缺失和来源故障测试；关键 stale 数据仍得出确定健康，即失败。 | ADR-0011、ACC |
| MVP-HLT-004 | Health Score 必须为可为空的 0～100 派生值；UNKNOWN 且证据不足时必须为 null，不得以 0、100 或分数阈值推翻离散状态。 | API、页面和排序测试；UNKNOWN 显示 0 或高分把 CRITICAL 降为 DEGRADED，即失败。 | ADR-0011、ARC-HLT、ACC |
| MVP-HLT-005 | Device、Interface、Circuit、Site、Business Service 和 Collector 必须使用按对象类型版本化的 Health Policy；关键依赖、冗余、法定人数和覆盖率不得被简单算术平均替代。 | 核心设备与冗余场景；一个核心 CRITICAL 被大量普通 HEALTHY 平均掉，即失败。 | ADR-0011、DOMAIN |
| MVP-HLT-006 | 当前健康结果必须包含状态、分数、模式、质量、coverageRatio、主要/辅助原因、策略版本、计算时间和有效期；聚合接口必须同时给出已评估、未知、过期和来源不可用数量。 | API 契约和大屏验收；仅返回一个整数或隐藏覆盖率，即失败。 | ADR-0011、ARC-HLT、ACC |
| MVP-HLT-007 | Health Transition 必须追加保存原因、证据、策略版本和时间；恢复必须遵守迟滞和确认窗口，下游因上游不可达时必须表达为 UNKNOWN/UPSTREAM_UNREACHABLE。 | 抖动、上游故障和历史测试；状态覆盖历史或下游全部伪造为独立 CRITICAL，即失败。 | ADR-0011、ARC-HLT |
| MVP-HLT-008 | Current Health 必须预计算并在 Condition 变化时增量更新受影响对象，同时周期执行完整一致性校验；不得在每次查询重算全局对象。 | MVP-S1 队列和查询测试；30,000 接口下队列无界增长或查询触发全量计算，即失败。 | ADR-0011、ADR-0012、CAP-ACC |

## 14. Alert 与 Incident

事件数据流：

```text
Alert Instance + Health Impact + Topology
                    ↓
                 Incident
```

### 14.1 Alert

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-ALT-001 | Alert Rule、Alert Fingerprint、Alert Instance/Episode 和 Alert State Transition 必须使用独立身份；Fingerprint 必须只由稳定字段构成。 | 去重和历史测试；时间戳、当前值或动态消息进入 Fingerprint，即失败。 | ADR-0009、DOMAIN、ACC |
| MVP-ALT-002 | 同一 Fingerprint 在一个 Episode 恢复后再次触发必须创建新的 Alert Instance；不得把已 Resolved Episode 覆盖回 Firing。 | 复发测试；发生次数、MTTA 或 MTTR 历史被覆盖，即失败。 | ADR-0009、ACC |
| MVP-ALT-003 | 检测生命周期、人工确认、通知、抑制和数据状态必须独立建模；确认、抑制或维护不得等同于 Resolved。 | 多维状态组合测试；ACK 或 SUPPRESSED 改写检测状态，即失败。 | ADR-0009、ACC |
| MVP-ALT-004 | Alert Transition 必须追加记录原/新状态、原因、规则和条件版本、证据、来源、collectorId、时间和操作者；普通操作不得删除或覆盖转换历史。 | 审计与归档测试；仅以可覆盖 currentState 充当完整历史，即失败。 | ADR-0009、DOMAIN |
| MVP-ALT-005 | Alert Engine 必须消费 Condition Evaluation 并负责 Episode、幂等、人工确认、维护、抑制和通知策略；不得重新执行共享 MetricsQL、阈值或窗口。 | 条件变更和依赖测试；Alert 内存在第二套条件实现，即失败。 | ADR-0012、ARC-ALT |
| MVP-ALT-006 | 指标型结果必须采用 vmalert 实时推送加 30～60 秒周期对账；平台不得因未收到推送而自动恢复 Alert，只有可验证 Resolved、健康执行对账或受控修正才可恢复。 | 平台/vmalert 中断、重启和对账测试；遗漏推送造成假恢复或重复 Episode，即失败。 | ADR-0010、ACC |
| MVP-ALT-007 | 通知投递必须独立记录渠道、目标、尝试、结果、重试、限速和抑制；通知失败不得阻止 Alert 或 Incident 权威状态持久化。 | 通知故障测试；投递失败回滚业务状态或被当作 Alert 状态，即失败。 | ADR-0009、ADR-0010 |
| MVP-ALT-008 | Alert Rule 必须区分 METRIC、TRAP_EVENT 和 PLATFORM_EVENT：METRIC 绑定 vmalert 执行的 Condition，Trap 与平台事件由平台事件规则处理；不得让 Trap/平台事件依赖 vmalert 才能形成事实。 | 三类规则故障隔离测试；vmalert 停止导致 Trap 或备份失败事件无法处理，即失败。 | ADR-0010、ARC-ALT |
| MVP-ALT-009 | 维护窗口和上游根因抑制必须保留底层 Alert Episode 与实际检测状态，仅按策略抑制通知或自动 Incident；不得删除下游告警或把其标记为 Resolved。 | 维护和上游故障场景；维护/抑制造成历史缺口或假恢复，即失败。 | ADR-0009、ADR-0010、ACC |
| MVP-ALT-010 | 指标型 Pending 语义必须由 vmalert 执行，平台必须通过对账获取并展示 Pending；短暂 Pending 可以只保留轻量评估记录，但不得在执行器异常时伪造 Pending 消失。 | Pending、平台重启和数据源故障测试；Pending 被平台重复计算或故障被当作 FALSE，即失败。 | ADR-0010、ARC-ALT |
| MVP-ALT-011 | Alert Instance 必须保留触发时的 ruleId/ruleVersion、conditionId/conditionVersion、表达式摘要和严重等级；语义性规则变更不得静默改写活动或历史 Episode。 | 规则描述、阈值、范围、停用和回滚测试；旧 Episode 被新版本覆盖或删除，即失败。 | ADR-0009、ADR-0010 |

### 14.2 Incident

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-INC-001 | Incident 必须是独立于 Alert 的人工协调处置事件，可从一个/多个 Alert、设备、线路、拓扑异常或无现成告警的问题人工声明；不得把单条 Trap、通知或阈值事件直接等同于 Incident。 | 数据模型和创建流程；Alert 与 Incident 共用身份或每条 Alert 自动成 Incident，即失败。 | ADR-0009、ACC |
| MVP-INC-002 | Incident 生命周期必须支持 DECLARED、INVESTIGATING、MITIGATING、MONITORING、RESOLVED、CLOSED、CANCELED，并区分技术恢复与流程关闭。 | 状态转换测试；RESOLVED 与 CLOSED 无法区分，即失败。 | ADR-0009、DOMAIN |
| MVP-INC-003 | IncidentAlertLink 必须记录关联角色、来源、操作者、时间和解除历史，并至少区分根因候选、确认根因、症状、影响和相关。 | 关联和解除测试；解除关系删除历史或角色不可解释，即失败。 | ADR-0009、ACC |
| MVP-INC-004 | Incident 影响范围必须保存事件时点快照或版本引用，时间线必须追加记录状态、负责人、严重等级、处置、关联、关闭和重开；普通编辑不得覆盖原记录。 | 拓扑变更后的历史查询；历史影响随当前拓扑漂移或时间线被改写，即失败。 | ADR-0009、ACC |
| MVP-INC-005 | Alert Resolved 不得自动关闭 Incident；Incident Closed、Canceled、解除关联或修改严重等级不得修改、删除或伪造底层 Alert 历史。 | 独立生命周期测试；任一方向产生隐式改写，即失败。 | ADR-0009、ACC |
| MVP-INC-006 | 自动声明和关联必须限于可解释、版本化的确定性规则；复杂跨域归并必须保留人工确认边界。 | 规则审计和重复事件测试；无法提供规则 ID、版本和匹配依据，即失败。 | ADR-0009、SCOPE |
| MVP-INC-007 | Alert Severity、Incident Severity 和 Incident Priority 必须独立保存；Incident 等级调整必须记录原值、新值、原因、操作者和时间，不得改写原 Alert Severity。 | 严重等级与优先级测试；调整 Incident 反向修改规则或历史 Alert，即失败。 | ADR-0009、DOMAIN |
| MVP-INC-008 | Incident 关闭必须记录影响状态、关联告警检查、关闭摘要、最终影响、主要处置、关闭人和时间；高严重等级事件必须保留根因状态、复盘标记、后续行动和未解决风险。 | 关闭校验和重开测试；信息不全可静默关闭或重开无原因，即失败。 | ADR-0009、ACC |

## 15. 拓扑

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-TOP-001 | 拓扑必须支持区域、站点、机房、设备组、设备、接口和线路的分层结构，并保留核心业务路径与设备、线路的关联。 | 分层导航和影响分析；任一核心层级无法表达，即失败。 | CTX、DOMAIN、ACC |
| MVP-TOP-002 | 正式线路必须以不可变 topologyRelationId 关联双端设备和接口，并保存合同带宽、运营商、重要等级和业务用途等 Desired State。 | 线路创建、替换和历史测试；端点通过名称或 IP 临时拼接，即失败。 | ADR-0002、ADR-0003 |
| MVP-TOP-003 | 发现关系必须支持 CANDIDATE、CONFIRMED、REJECTED、CONFLICT、STALE、MISSING、LOCKED、RETIRED；候选关系必须经人工批准才能成为正式 Effective Topology。 | LLDP 候选确认/拒绝测试；自动发现无审批写入正式拓扑，即失败。 | ADR-0002、ACC |
| MVP-TOP-004 | 拓扑差异必须覆盖新设备、接口、邻接、期望缺失、对端变化、站点移动、型号/序列号/接口名变化和身份歧义，并提供接受、拒绝、忽略、合并、锁定和误报操作。 | 差异工作流验收；冲突被静默覆盖或无审计，即失败。 | ADR-0002、ADR-0003 |
| MVP-TOP-005 | 拓扑节点主视觉必须表达权威 Health，并以独立标记表达 Maintenance、Disabled、Stale、Source Unavailable 和 Conflicting；不得仅依靠颜色或健康分数。 | 可访问性和状态组合测试；维护隐藏底层红色或 UNKNOWN 显示绿色，即失败。 | ADR-0011、ARC-HLT |
| MVP-TOP-006 | 拓扑布局坐标和锁定关系必须作为 Desired State 保存，状态更新不得触发完整重新布局。 | 刷新和高频状态测试；位置漂移或状态变化导致全图重排，即失败。 | ADR-0002、CAP-ACC |

## 16. 领导大屏

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-UIE-001 | 领导大屏必须属于 MVP，Executive Viewer 必须通过普通认证后的服务端会话访问交互式只读视图。 | 登录和权限测试；大屏缺失、免登录或使用专用永久 Token，即失败。 | SCOPE、[大屏需求](../product/executive-dashboard.md)、ACC |
| MVP-UIE-002 | 大屏必须展示整体健康、核心设备在线率、核心线路可用率、重大告警、受影响站点和业务、聚合拓扑、24 小时趋势、利用率/不稳定线路排行和开放 Incident。 | 页面和数据契约验收；核心指标缺失或展示所有底层 Alert 滚动流，即失败。 | 大屏需求、ACC |
| MVP-UIE-003 | 大屏必须使用独立的后端只读聚合接口和 `dashboard.executive.read` 权限；不得复用返回凭据、管理地址清单或敏感配置的运维详情响应。 | API 权限与字段白名单测试；Executive Viewer 可读取敏感详情，即失败。 | ARC-AUTH、大屏需求 |
| MVP-UIE-004 | 大屏必须支持自动刷新、SSE、全屏、1920×1080 和基本 4K 适配；自动刷新和心跳不得延长会话空闲时间或绕过 12 小时绝对时长。 | 会话与显示测试；后台活动保持永久登录，即失败。 | ADR-0007、大屏需求、ACC |
| MVP-UIE-005 | 大屏必须同时展示已确认健康率、数据覆盖率、DEGRADED、CRITICAL、UNKNOWN 和维护数量；UNKNOWN 不得计为健康，维护对象不得混入普通 ACTIVE 健康率。 | 聚合口径测试；数据缺失使健康率虚高，即失败。 | ADR-0011、ARC-HLT、ACC |
| MVP-UIE-006 | 会话到期后大屏必须停止受保护请求和实时连接，显示数据停止更新、最后成功更新时间和重新登录提示；不得继续把缓存状态表现为实时正常。 | 超时测试；过期页面仍滚动更新或无陈旧标识，即失败。 | ADR-0007、大屏需求、ACC |

## 17. 运维工作台

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-UIO-001 | 运维工作台必须提供资产、接口、线路、探测、拓扑候选、差异和身份冲突的查询与受控处置流程。 | 角色化端到端验收；核心对象只能在数据库层操作，即失败。 | SCOPE、DOMAIN、ACC |
| MVP-UIO-002 | Alert 页面必须支持 Pending、Firing、Resolved、确认/批量确认、抑制、维护、关联 Incident、转换历史和多维筛选。 | 页面和 API 验收；确认操作改变检测状态或历史不可见，即失败。 | ADR-0009、ARC-ALT、ACC |
| MVP-UIO-003 | Incident 页面必须支持列表、详情、负责人、严重等级、优先级、影响、关联 Alert、根因候选、时间线、恢复、关闭、重开和历史关联。 | Incident 生命周期验收；关闭缺少摘要或时间线，即失败。 | ADR-0009、ACC |
| MVP-UIO-004 | 设备、接口和线路详情必须展示当前状态、数据质量、最后观测、来源、Health 原因与分数组成、指标趋势和关联告警；不得把 UNKNOWN 显示为 0 分或正常。 | 数据陈旧和健康解释测试；页面无法说明状态依据，即失败。 | ADR-0011、ARC-HLT |
| MVP-UIO-005 | 前端权限隐藏必须仅作为交互辅助，所有查询和命令必须由后端 RBAC 强制执行；不得通过直接调用 API 绕过角色边界。 | 越权 API 测试；隐藏按钮后接口仍可访问，即失败。 | ADR-0005、ARC-AUTH、ACC |

## 18. 认证、RBAC、TOTP 和会话

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-AUT-001 | 平台用户必须具有不可变 userId，业务、审计和处置历史必须引用 userId；用户名、邮箱、密码凭据或未来外部主体不得充当业务身份。 | 用户名变化和历史查询；操作人引用断裂或创建重复身份，即失败。 | ADR-0005、DOMAIN |
| MVP-AUT-002 | MVP 必须实现本地用户、本地密码、启停、管理员创建/重置、首次登录改密、最小 RBAC、会话撤销和受控应急管理员；认证提供者边界必须与业务模块解耦。 | 认证全流程；业务模块读取密码哈希或 IdP 厂商字段，即失败。 | ADR-0005、ARC-AUTH、ACC |
| MVP-AUT-003 | 后端必须按稳定权限集合执行默认拒绝；角色名称不得成为敏感授权或 MFA 判断的唯一硬编码依据。 | 自定义角色和直接 API 测试；改角色名或前端绕过可提升权限，即失败。 | ADR-0005、ADR-0006 |
| MVP-AUT-004 | 本地密码必须使用经审查的 Argon2id 等成熟慢哈希、独立盐和可升级参数；密码、哈希、临时密码不得返回 API 或写入日志。 | 密码存储和日志扫描；明文、可逆加密、快速哈希或固定默认密码，即失败。 | ADR-0005、ARC-AUTH |
| MVP-AUT-005 | 密码策略必须默认最少 12 字符、支持长密码、拒绝常见弱密码和用户名密码，并使用账号与来源限速、递增延迟或短时锁定；不得永久自动锁死或泄露用户是否存在。 | 弱密码、枚举和暴力尝试测试；无限尝试或账户永久 DoS，即失败。 | ADR-0005、ACC |
| MVP-AUT-006 | 拥有 `users.manage`、`roles.manage`、`credentials.manage`、`system.configure`、`authentication.manage`、`sessions.manage`、`backup.manage`、`restore.execute` 或同级敏感权限的用户必须完成 TOTP；判断必须基于实际权限集合。 | 自定义角色和权限变更测试；改角色名称可绕过 MFA，即失败。 | ADR-0006、ARC-AUTH、ACC |
| MVP-AUT-007 | TOTP 必须符合 RFC 6238，默认 30 秒、6 位、最多前后一个时间步，使用成熟库、独立随机 Secret、重放防护和独立限速；不得自行实现 HMAC/Base32 密码学。 | RFC 向量、时钟偏差、重放和限速测试；同一步验证码重复成功或无限窗口，即失败。 | ADR-0006、ACC |
| MVP-AUT-008 | TOTP Secret 必须应用级加密且密钥独立于数据库和 Git；恢复码必须一次显示、慢哈希保存、一次性使用，重置必须撤销会话并进入重新注册。 | 数据库泄露、恢复码和重置测试；可读明文 Secret、恢复码重用或密码重置绕过 MFA，即失败。 | ADR-0006、ARC-AUTH |
| MVP-AUT-009 | Web 会话必须使用 PostgreSQL 保存可撤销不透明状态，浏览器只持有至少 32 字节随机 Token 的 `__Host-` Cookie，数据库只保存 Token SHA-256 或等效摘要；不得使用浏览器 JWT、localStorage 或“记住我”。 | 数据库、浏览器和日志检查；原始 Token 入库、入 URL、入响应或可被 JavaScript读取，即失败。 | ADR-0007、ACC |
| MVP-AUT-010 | 预认证会话必须固定最多 5 分钟且只访问认证接口；正式会话必须默认 30 分钟空闲、12 小时绝对时长、10 分钟敏感操作近期认证，且由服务端计算。 | 时间推进和后台刷新测试；预认证可访问业务 API或自动轮询延长空闲期，即失败。 | ADR-0007、ARC-AUTH、ACC |
| MVP-AUT-011 | 登录、MFA 完成、密码/MFA 变化、敏感权限变化和 break-glass 后必须轮换或撤销会话；authorizationVersion 不匹配、用户停用和权限降低必须即时拒绝旧会话。 | 会话固定、权限变化和停用测试；旧会话获得新权限或保留撤销权限，即失败。 | ADR-0006、ADR-0007 |
| MVP-AUT-012 | Cookie 认证必须使用 Secure、HttpOnly、SameSite=Lax、Path=/、无 Domain 的生产基线，并对状态变更实施 CSRF Token/确认头及 Origin 校验；SameSite 不得作为唯一 CSRF 防护。 | 浏览器和跨站请求测试；跨站命令成功或生产 Cookie 缺少属性，即失败。 | ADR-0007、ACC |
| MVP-AUT-013 | SSE/未来 WebSocket 必须在建立和重连时验证会话，并在撤销、授权版本变化或到期后关闭；心跳和 Ping/Pong 不得更新用户活动。 | 长连接到期与撤销测试；连接永久绕过会话检查，即失败。 | ADR-0007、ACC |
| MVP-AUT-014 | 灾难恢复后必须使全部历史预认证和正式会话失效；恢复数据库不得重新激活旧 Cookie。 | 空白主机恢复测试；备份前 Cookie 恢复后仍有效，即失败。 | ADR-0007、ADR-0004、ACC |
| MVP-AUT-015 | 用户必须能查看并撤销自己的活动会话，具备 `sessions.manage` 的管理员必须能撤销其他用户会话；任何人不得查看原始 Session Token。 | 当前/其他/全部会话撤销测试；撤销后 Token 仍有效或管理接口返回原 Token，即失败。 | ADR-0007、ARC-AUTH |
| MVP-AUT-016 | 用户获得敏感权限时必须递增 authorizationVersion、撤销旧权限上下文并进入 `MFA_ENROLLMENT_REQUIRED`；敏感权限不得在完成重新认证和 TOTP 注册验证前生效。 | 权限提升与旧会话测试；旧会话自动获得敏感权限或未注册即可调用敏感 API，即失败。 | ADR-0006、ADR-0007 |
| MVP-AUT-017 | 首个管理员必须通过本机或受控初始化命令一次性创建并留下审计，初始化成功后必须关闭入口；不得通过公开 Web 自助注册或在输出中回显密码。 | 空库初始化和重复执行测试；远程公开创建首个管理员或固定默认密码，即失败。 | ADR-0005、ARC-AUTH |
| MVP-AUT-018 | TOTP 注册必须在完整密码认证和近期重新认证后生成待确认 Secret，只有验证有效验证码并生成一次性恢复码后才能激活；未验证 Secret 不得成为有效认证器。 | 注册中断、重试和激活测试；扫描二维码但未验证即可登录，即失败。 | ADR-0006、ARC-AUTH |

## 19. 审计和安全

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-SEC-001 | 登录、失败、退出、密码/MFA、用户、角色、权限、会话、应急访问、身份/拓扑确认、规则发布、告警/Incident、备份恢复和管理员修正必须形成追加式审计。 | 审计事件矩阵；任一敏感操作无事件、操作者或结果，即失败。 | ADR-0002、ADR-0003、ADR-0005 至 0013、ACC |
| MVP-SEC-002 | 审计必须包含事件 ID、平台用户/操作者、类型、时间、来源、结果、失败分类、对象和请求关联 ID；不得包含密码、哈希、Token、Cookie、TOTP、恢复码、SNMP Secret、数据库密码或私钥。 | 日志和审计扫描；敏感材料出现或事件无法关联请求，即失败。 | ARC-AUTH、ACC |
| MVP-SEC-003 | SNMP、数据库、服务认证、TOTP 加密和私钥材料必须通过受控 Secret 注入和独立备份；真实 Secret 不得提交 Git、Compose、镜像或普通日志。 | Secret 扫描和恢复演练；仓库或镜像含真实凭据，即失败。 | ADR-0004、ADR-0005、ADR-0006 |
| MVP-SEC-004 | 生产登录和管理入口必须仅通过同源 HTTPS，内部 vmalert/Collector Ingest 必须使用独立服务身份并限制在内部网络；不得通过 URL 传递凭据。 | 网络和接口安全测试；内部接收端公网暴露或无服务认证，即失败。 | ADR-0007、ADR-0010、ARC-DEP |
| MVP-SEC-005 | 生产主机必须启用可靠 NTP 并监控同步与明显偏差；时间异常必须产生平台告警，TOTP 验证不得靠无限扩大窗口补偿。 | 时间偏差故障注入；时钟异常未检测或 TOTP 窗口超边界，即失败。 | ADR-0006、ACC |
| MVP-SEC-006 | Emergency Administrator 必须使用强密码和 TOTP、离线恢复材料、每次高优先级审计；宿主机 break-glass 只能撤销旧认证器并要求重设，不得显示原 Secret 或成为普通登录旁路。 | 应急恢复演练；应急账号免 MFA、无主机日志或产生通用绕过码，即失败。 | ADR-0005、ADR-0006 |
| MVP-SEC-007 | 查看凭据、权限管理、MFA 重置、恢复执行、密钥轮换和关闭审计/备份等敏感操作必须要求近期 MFA 或重新认证；权限失败必须安全审计且不得泄露 Secret。 | 敏感操作和降权测试；过期认证可直接执行或失败响应泄密，即失败。 | ADR-0006、ARC-AUTH |

## 20. PostgreSQL Inbox、Outbox 和 Job Queue

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-JOB-001 | PostgreSQL 必须作为 Inbox、Transactional Outbox、Background Job Queue、Worker Lease、幂等控制和 Dead Letter 的唯一权威协调源。 | 架构和故障恢复；进程内队列或未批准 Broker 成为唯一任务来源，即失败。 | ADR-0013、ARC-RUN、ACC |
| MVP-JOB-002 | Go Observation、vmalert Evaluation、Trap 和其他可重试内部消息必须先以稳定幂等键进入 Inbox；重复提交不得产生重复 Observation、Condition Transition、Alert Episode、Health Transition 或 Incident Timeline。 | 重放与并发测试；相同消息生成重复业务状态，即失败。 | ADR-0013、ACC |
| MVP-JOB-003 | 业务状态与异步行为必须在同一 PostgreSQL 事务内写入 Outbox；不得采用“先提交数据库、再直接调用服务”的无补偿双写。 | 崩溃点注入；数据库已提交但异步意图永久丢失，即失败。 | ADR-0013、ARC-RUN |
| MVP-JOB-004 | Job Queue 必须记录类型、引用、优先级、availableAt、尝试、租约、开始/完成和失败摘要，并通过短事务、行锁和 `SKIP LOCKED` 或等效数据库机制认领。 | 并发 Worker 测试；同一任务失控并发或长事务阻塞业务读取，即失败。 | ADR-0013 |
| MVP-JOB-005 | 异步执行必须采用至少一次投递加幂等消费者；不得宣称 exactly-once，外部副作用必须具有幂等键，数据库唯一约束必须作为最终防线。 | Worker 崩溃和重复副作用测试；重试产生重复通知或状态转换，即失败。 | ADR-0013、ACC |
| MVP-JOB-006 | 任务租约必须有限期并可续租，Worker 停止时必须停止领取、完成有限短任务并让未完成任务可重认领；不得留下永久 `processing` 状态。 | 强制终止和主机重启测试；任务永久卡死或需手工改库，即失败。 | ADR-0013、ARC-RUN |
| MVP-JOB-007 | 重试必须按错误分类使用最大次数、指数退避和抖动；超限任务必须进入可查询、可审计、可人工重试的 Dead Letter，并产生平台告警。 | 永久/临时错误测试；失败静默丢弃或无限热重试，即失败。 | ADR-0013、ACC |
| MVP-JOB-008 | 队列必须保证安全和核心状态优先，同时通过配额或老化避免低优先级永久饥饿；Advisory Lock 只可用于少量单例协调，不得按设备、接口、指标或会话长期加锁。 | 压力和锁竞争测试；库存任务阻塞核心告警或数据库锁无界增长，即失败。 | ADR-0013、CAP-ACC |
| MVP-JOB-009 | Worker 必须暴露版本、心跳、各队列长度、最老等待、吞吐、失败、重试、Dead Letter、执行时长、Condition/Health/Alert 延迟和 Inbox/Outbox 积压；持续异常必须产生 Platform Alert。 | 可观测性与断进程测试；Worker 停止或积压不可见，即失败。 | ADR-0013、ARC-CAP |
| MVP-JOB-010 | SSE 状态更新必须由 Worker 持久化业务状态和 Outbox，API 按权限分发；LISTEN/NOTIFY 可以只作唤醒提示，不得成为唯一消息存储或承载完整敏感数据。 | API 重启和通知丢失测试；事件只能靠瞬时通知恢复或绕过 RBAC，即失败。 | ADR-0013、ARC-RUN |

## 21. 时序存储和 vmalert

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-ARC-013 | VictoriaMetrics 必须保存原始/聚合时序、Condition 中间结果和 vmalert 状态；不得成为人工确认、Incident、权限或最终 Alert 历史的权威库。 | 数据恢复和查询测试；PostgreSQL 丢失后仅靠 VictoriaMetrics 伪造人工历史，即失败。 | ADR-0010、ARC-ALT |
| MVP-ARC-014 | PostgreSQL 中 Condition/Alert 定义必须是规则权威来源，平台必须生成带稳定 ID、版本和哈希的 vmalert 配置；生产不得依赖手工编辑 YAML。 | 规则发布和漂移检查；运行配置无来源版本或可被任意文件覆盖，即失败。 | ADR-0010、ADR-0012 |
| MVP-ARC-015 | vmalert 必须把状态写回 VictoriaMetrics、在启动时恢复计算连续性，并暴露执行、错误、耗时、匹配数量、Reload 和恢复指标；其失败不得成为业务 Condition FALSE 或 Alert 恢复的证据。 | vmalert/VM 重启与故障注入；状态恢复失败无告警或执行器失败导致业务正常化，即失败。 | ADR-0010、ACC |
| MVP-ARC-016 | vmalert 内部推送端点必须批量、幂等、快速持久化并逐项报告拒绝；不得在同步接收中执行缓慢通知或因单条坏数据静默丢弃整批。 | 批量部分失败和重试测试；接收超时阻塞执行器或有效项丢失，即失败。 | ADR-0010、ADR-0013 |

## 22. 备份、恢复和部署

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-OPS-001 | 生产部署必须使用单台 Ubuntu Server 24.04 LTS、Docker Engine 和 Compose Plugin；主机、磁盘或 Docker 故障必须由运维人员在原主机或备用主机人工恢复。 | 部署和故障演练；文档承诺自动主机切换，即失败。 | ADR-0004、ARC-DEP、ACC |
| MVP-OPS-002 | A 类配置与业务状态必须达到 RPO≤4 小时、RTO≤4 小时；B 类时序指标必须达到 RPO≤24 小时、RTO≤8 小时。 | 空白主机恢复报告；实测超目标且未阻止发布，即失败。 | ADR-0004、ARC-DEP、ACC |
| MVP-OPS-003 | PostgreSQL 必须每 4 小时生成可用于 `pg_restore` 的自定义格式逻辑备份，同时备份角色/全局对象、校验和和结果；不得把运行中 volume 复制作为唯一备份。 | 实际恢复测试；文件存在但数据库不可恢复，即失败。 | ADR-0004、ACC |
| MVP-OPS-004 | VictoriaMetrics 必须每日使用官方快照和 vmbackup 复制到主机外目标，并以 vmrestore 验证恢复；不得直接复制运行中数据目录作为备份方法。 | 指标恢复和新写入测试；历史不可查询或恢复后不能继续写入，即失败。 | ADR-0004、ARC-DEP |
| MVP-OPS-005 | 备份必须位于主机、物理磁盘和 Docker volume 之外；目标不可用或备份失败必须产生高优先级运维告警。 | 断开备份目标测试；任务仍报成功或无告警，即失败。 | ADR-0004、ACC |
| MVP-OPS-006 | PostgreSQL 保留必须覆盖最近 48 小时每 4 小时、14 天每日、8 周每周；VictoriaMetrics 必须保留 7 个每日和 4 个每周备份。 | 保留策略和清理测试；有效恢复点早于承诺窗口被清除，即失败。 | ADR-0004、ARC-DEP |
| MVP-OPS-007 | 上线前必须完成至少一次从空白 Ubuntu 主机恢复，验证身份不变、登录、资产、拓扑、规则、维护、指标查询、新采集、告警流程、Compose 重启和实际 RPO/RTO。 | 恢复演练报告；仅验证脚本退出码或文件存在，即失败。 | ADR-0004、ACC |
| MVP-OPS-008 | 生产必须配置平台外部可用性检查，覆盖主机、HTTPS 健康、最近备份和最近采集；不得依赖本平台作为整机失效的唯一通知来源。 | 关闭整机测试；外部系统无检测信号，即失败。 | ADR-0004、ARC-DEP |
| MVP-OPS-009 | PostgreSQL 不可用时必须拒绝可能产生不一致的配置和认证；VictoriaMetrics 不可用时资产配置应可读但指标标记不可用；采集器故障时历史不得删除且状态必须过期化。 | 组件故障矩阵；默认放行、假正常或历史删除，即失败。 | ADR-0004、ARC-DEP、ACC |

## 23. MVP-S1 容量与性能

### 23.1 目标与压力规模

| 维度 | MVP-S1 目标 | 120% 短时压力 |
| --- | ---: | ---: |
| Managed Devices | 500 | 600 |
| Managed Interfaces | 30,000 | 36,000 |
| Active Probe Tasks | 2,000 | 2,400 |
| Topology Relations | 5,000 | 6,000 |
| Concurrent Authenticated Sessions | 50 | 60 |
| Concurrent Executive Dashboards | 5 | 6 |

### 23.2 参考环境

- 生产主机：16 个 x86-64 vCPU、64 GB RAM、至少 2 TB 可用 NVMe SSD、1 Gbps 或更高管理网络。
- 浏览器终端：Windows 11、现代 8 核 CPU、16 GB RAM、受支持的 Chrome 或 Edge、1920×1080、千兆局域网、无独显依赖。

### 23.3 采集负载模型

| 数据类型 | 参考周期 |
| --- | ---: |
| 核心 TCP/ICMP 可达性 | 10 秒 |
| 核心接口状态 | 15 秒 |
| 普通接口状态 | 30 秒 |
| 接口流量、错误和丢弃 | 30 秒 |
| CPU、内存和温度 | 60 秒 |
| 普通主动探测 | 10～30 秒 |
| LLDP/邻接发现 | 10 分钟 |
| 资产信息 | 6 小时 |
| 序列号和静态库存 | 24 小时或人工触发 |

### 23.4 性能目标

| 操作 | p95 目标 |
| --- | ---: |
| 普通列表和详情 API | ≤500 ms |
| 领导大屏摘要 | ≤1 s |
| 站点聚合拓扑 | ≤1 s |
| 500 节点设备拓扑快照 | ≤2 s |
| 24 小时单对象趋势 | ≤2 s |
| 7 天单对象趋势 | ≤5 s |
| 设备、接口或线路搜索 | ≤1 s |
| 告警确认和状态变更 | ≤1 s（不含外部通知） |

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-PER-001 | MVP-S1 必须按本节目标规模验收，并接受 120% 规模持续 30 分钟的短期压力测试；500 台不得成为授权或代码硬限制。 | CAP-ACC 全流程；第 501 台被直接拒绝或未完成目标规模验证即宣称支持，即失败。 | ADR-0008、ARC-CAP、CAP-ACC |
| MVP-PER-002 | 容量验收必须在参考 Ubuntu 主机和参考浏览器终端执行；Windows 开发结果不得替代生产容量结论。 | 容量报告环境信息；缺少硬件/系统版本或只报告开发机数据，即失败。 | ADR-0008、CAP-ACC |
| MVP-PER-003 | 容量测试必须运行本节真实或模拟采集周期、协议失败和任务混合；不得只创建数据库记录。 | 测试配置与报告；任务数量、周期、超时设备或协议组合未记录，即失败。 | ADR-0008、CAP-ACC |
| MVP-PER-004 | 活跃时间序列设计预算必须≤500,000，持续写入≤20,000 samples/s，短时峰值≤30,000 samples/s，原始指标默认保留 90 天；超过基数预算必须先审查指标与标签。 | VictoriaMetrics 指标和容量报告；通过无界标签或盲目加硬件掩盖基数，即失败。 | ADR-0008、ARC-CAP |
| MVP-PER-005 | 正常 Web 模型必须覆盖 5 个大屏 SSE、15 个活跃运维、20 个普通只读、10 个低活动会话，约 25 requests/s 持续和 50 requests/s 峰值；鉴权不得为性能测试关闭。 | 负载脚本配置和报告；跳过会话/RBAC获得结果，即失败。 | ADR-0008、CAP-ACC |
| MVP-PER-006 | API 必须达到本节 p95 目标并报告 p50/p95/p99、错误率；正常有效请求错误率必须低于 0.1%，不得出现持续队列或连接池耗尽。 | CAP-ACC；仅报告平均值或排除真实鉴权成本，即失败。 | ADR-0008、ARC-CAP |
| MVP-PER-007 | Trap 可见 p95 必须≤3 秒，主动探测结果可查询 p95≤2 秒，持久状态到 SSE p95≤2 秒，前端收到后 1 秒内可见；报告必须区分采集周期和传播延迟。 | 分阶段时间戳报告；把传播延迟宣称为完整故障发现时间，即失败。 | ADR-0008、CAP-ACC |
| MVP-PER-008 | 领导拓扑默认必须≤100 节点/300 边，站点视图≤300 节点/1,000 边，完整设备视图≤500 节点/2,000 边；状态更新不得全量布局。 | 前端容量测试；默认绘制 30,000 接口或持续冻结超过目标，即失败。 | ADR-0008、CAP-ACC |
| MVP-PER-009 | 告警容量必须覆盖 200 个规则、5,000 个同时非正常实例和 10 分钟 10,000 次状态转换；不得因风暴破坏幂等、Incident 关联、领导大屏或通知抑制。 | 告警风暴报告；重复 Episode、配置丢失或页面不可访问，即失败。 | ADR-0008、ADR-0009、CAP-ACC |
| MVP-PER-010 | 目标负载必须预热 2 小时、持续 8 小时，随后压力 30 分钟并恢复观察 1 小时；压力解除后积压必须在 10 分钟内明显下降且无需人工重启。 | 容量时间线和队列图；OOM、数据损坏、身份错误合并、无界积压或手工重启恢复，即失败。 | ADR-0008、ADR-0013、CAP-ACC |
| MVP-PER-011 | 持续目标负载下整机平均 CPU 应低于 70%、内存应保留 20%、90 天容量后磁盘应保留 25%；不得依赖持续 Swap 或无资源余量维持运行。 | 资源报告和趋势；无界内存/Goroutine/连接增长或 OOM，即失败。 | ADR-0008、CAP-ACC |
| MVP-PER-012 | 每次正式容量验收必须输出 commit、镜像和系统版本、硬件、数据集、周期、时序基数、写入、并发模型、时长、延迟分位、错误率、资源/队列峰值、问题和已验证范围；不得宣称超过实测规模。 | 容量报告完整性；缺关键证据或营销口径超出报告，即失败。 | ADR-0008、CAP-ACC |
| MVP-PER-013 | 正常负载下 95% 主动探测任务必须在计划时间偏差不超过任务周期 20% 的窗口内开始，明确例外必须写入规格；队列不得持续增长或让任务饥饿。 | 调度延迟、最老等待和恢复曲线；慢目标耗尽 Worker 或积压无法自动清除，即失败。 | ADR-0008、CAP-ACC |

## 24. 可观测性和降级行为

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-OPS-010 | API、Worker、Go、PostgreSQL、VictoriaMetrics、vmalert、备份和主机必须暴露健康、错误、延迟、资源、队列和最近成功时间；平台组件故障必须可区分。 | 运维指标清单和故障注入；只能看到统一“系统异常”或无来源，即失败。 | ARC-CAP、ARC-DEP、ACC |
| MVP-OPS-011 | 资源压力时必须依次优先保证认证授权、PostgreSQL 一致性、核心采集、Alert、Health/实时写入、只读查询、普通采集、发现、库存和低优先级报表；降级不得静默。 | 120% 压力和优先级测试；低优先任务挤占核心任务或页面仍报正常，即失败。 | ADR-0008、CAP-ACC |
| MVP-OPS-012 | vmalert、VictoriaMetrics、Collector、Worker、对账或数据源故障必须表现为 EVALUATION_ERROR、DATA_STALE、SOURCE_UNAVAILABLE 或 UNKNOWN，并产生独立平台健康信号；不得依赖同一失效路径作为唯一自监控。 | 逐组件断开测试；故障被当作业务恢复或没有外部/独立信号，即失败。 | ADR-0010、ADR-0011、ADR-0013 |
| MVP-OPS-013 | 服务恢复后必须重新对账 Condition、Alert、Health、任务和数据新鲜度，陈旧状态不得直接回到正常。 | 中断恢复测试；恢复进程后旧绿色状态立即复用而无新证据，即失败。 | ADR-0010、ADR-0011、ACC |

## 25. 数据保留

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-OPS-014 | 原始时序指标必须默认保留 90 天；Alert Instance/Transition、Incident/Timeline、通知投递、审计和处置记录必须至少保留 1 年，制度要求更长时从其规定。 | 保留与归档测试；未记录地提前清除历史，即失败。 | ADR-0008、ADR-0009、ARC-CAP |
| MVP-OPS-015 | 正式资产、身份、拓扑和替换/合并历史必须在对象归档后继续保留；临时缓存和可重新发现的未确认数据可以按配置清理，但不得破坏审计或正式引用。 | 归档和清理测试；历史 Incident 或指标无法解析对象，即失败。 | ADR-0002、ADR-0003、DOMAIN |
| MVP-OPS-016 | 若 90 天指标无法满足参考磁盘预算，必须通过容量报告选择降频、分层保留、聚合、调整模型或增盘；不得无记录静默删除。 | 容量预测和变更记录；实际保留短于承诺且无规格变更，即失败。 | ADR-0008、CAP-ACC |

## 26. 验收映射

### 26.1 需求分类映射

| 需求编号 | 验收来源 | 验收方式 | 是否阻塞发布 |
| --- | --- | --- | --- |
| MVP-GEN-001～008 | ACC、SCOPE、CLOSURE | 规格追踪、范围和端到端审查 | 是 |
| MVP-GEN-101～115 | ACC、全部 ADR | 依赖、运行组件、功能和安全负面检查 | 是 |
| MVP-ARC-001～023 | ACC、ARC-CODE、ARC-RUN、ARC-DEP、ADR-0001/0004/0010/0012/0013 | 环境矩阵、进程、数据流、迁移、工作区、测试层和集成测试 | 是 |
| MVP-AST-001～011 | ACC、DOMAIN、ADR-0002/0003 | 身份、导入、差异、替换、堆叠、归档和审计测试 | 是 |
| MVP-COL-001～007 | ACC、CAP-ACC、ADR-0001/0010 | 协议、调度、Trap、探测和来源故障测试 | 是 |
| MVP-OBS-001～005 | ACC、CAP-ACC、DOMAIN、ADR-0002/0003/0012 | 来源、规范化、身份隔离、标签基数和新鲜度测试 | 是 |
| MVP-CND-001～009 | ACC、CAP-ACC、ADR-0010/0012 | 三值逻辑、版本、DAG、发布、回滚、幂等和性能测试 | 是 |
| MVP-HLT-001～008 | ACC、CAP-ACC、ADR-0011/0012 | 状态组合、覆盖率、策略版本、迟滞、增量计算测试 | 是 |
| MVP-ALT-001～011 | ACC、CAP-ACC、ADR-0009/0010/0012 | Episode、状态维度、规则类型、版本、Pending、维护、推送对账、风暴和通知故障测试 | 是 |
| MVP-INC-001～008 | ACC、ADR-0009 | 生命周期、关联、快照、时间线、等级、关闭和重开测试 | 是 |
| MVP-TOP-001～006 | ACC、CAP-ACC、ADR-0002/0003/0011 | 分层、候选、差异、身份、视觉和布局测试 | 是 |
| MVP-UIE-001～006 | ACC、大屏需求、CAP-ACC | 权限、字段白名单、实时、超时、分辨率和容量测试 | 是 |
| MVP-UIO-001～005 | ACC、SCOPE | 角色化工作流、状态表达和越权 API 测试 | 是 |
| MVP-AUT-001～018 | ACC、ADR-0005/0006/0007 | 初始化、密码、RBAC、TOTP、恢复码、权限提升、会话、CSRF 和长连接测试 | 是 |
| MVP-SEC-001～007 | ACC、ADR-0004/0005/0006/0010 | 审计矩阵、Secret 扫描、TLS、时间和 break-glass 演练 | 是 |
| MVP-JOB-001～010 | ACC、CAP-ACC、ADR-0013 | 崩溃点、重放、租约、重试、Dead Letter、优先级和积压恢复测试 | 是 |
| MVP-OPS-001～016 | ACC、CAP-ACC、ADR-0004/0008/0010/0011/0013 | 部署、备份、空白恢复、故障矩阵、可观测性和保留测试 | 是 |
| MVP-PER-001～013 | CAP-ACC、ADR-0008 | 目标负载、任务调度、120% 压力、恢复观察和正式容量报告 | 是 |

### 26.2 ADR 覆盖

| ADR | 本规格覆盖 |
| --- | --- |
| [ADR-0001](../architecture/adr/0001-centralized-mvp-collection-boundary.md) | MVP-ARC-005、MVP-COL-003 |
| [ADR-0002](../architecture/adr/0002-separate-desired-observed-and-effective-state.md) | MVP-AST-001～003、MVP-TOP-002～004 |
| [ADR-0003](../architecture/adr/0003-use-immutable-platform-identities.md) | MVP-AST-004～011、MVP-OBS-003 |
| [ADR-0004](../architecture/adr/0004-use-single-host-manual-recovery.md) | MVP-ARC-002、MVP-OPS-001～009、MVP-AUT-014 |
| [ADR-0005](../architecture/adr/0005-use-local-authentication-with-oidc-boundary.md) | MVP-AUT-001～005/017、MVP-SEC-001～004 |
| [ADR-0006](../architecture/adr/0006-require-totp-for-sensitive-permissions.md) | MVP-AUT-006～008/016/018、MVP-SEC-005～007 |
| [ADR-0007](../architecture/adr/0007-use-postgresql-backed-opaque-web-sessions.md) | MVP-AUT-009～016、MVP-UIE-004/006 |
| [ADR-0008](../architecture/adr/0008-define-mvp-s1-capacity-class.md) | MVP-PER-001～013、MVP-OPS-011/014/016 |
| [ADR-0009](../architecture/adr/0009-separate-alerts-from-incidents.md) | MVP-ALT-001～004/007/009、MVP-INC-001～008 |
| [ADR-0010](../architecture/adr/0010-use-vmalert-with-push-and-reconciliation.md) | MVP-CND-005/007/009、MVP-ALT-006/008～011、MVP-ARC-013～016 |
| [ADR-0011](../architecture/adr/0011-separate-health-status-mode-and-score.md) | MVP-HLT-001～008、MVP-UIE-005、MVP-TOP-005 |
| [ADR-0012](../architecture/adr/0012-introduce-shared-condition-evaluation.md) | MVP-OBS-002/005、MVP-CND-001～009、MVP-ALT-005、MVP-HLT-008 |
| [ADR-0013](../architecture/adr/0013-use-api-worker-and-postgresql-coordination.md) | MVP-ARC-007～010、MVP-JOB-001～010、MVP-PER-010 |

### 26.3 已知验收文档缺口

现有 ACC 和 CAP-ACC 已覆盖主要发布行为。Ticket 拆分时需为以下规格补齐可执行测试条目：公共协议生成物防漂移（MVP-ARC-011）、显式全局迁移入口（MVP-ARC-012）、CSV 导入撤销的完整路径（MVP-AST-009）、运维工作台组合页面（MVP-UIO-001～004）。这些是测试编排缺口，不是产品决策阻塞项。

## 27. 风险和当前假设

| 类型 | 内容 | 控制方式 |
| --- | --- | --- |
| 已决定 | 中心管理网络可直达 MVP 纳管目标 | `central-default`；隔离网络出现时新 ADR |
| 已决定 | 单主机非 HA，可人工恢复 | RPO/RTO、主机外备份、空白主机演练、外部检查 |
| 当前假设 | 参考主机可承载 MVP-S1 | 以正式容量报告验证，不把目标写成授权限制 |
| 当前假设 | PostgreSQL 队列可承载单主机任务量 | 监控锁、队列和事务；触发条件满足后再评估 Broker |
| 当前假设 | 90 天时序数据适配 2 TB 参考磁盘 | 报告压缩增长和安全余量；超预算按 MVP-OPS-016 决策 |
| 当前假设 | 单一 Go Collector 二进制足以覆盖协议执行 | 保持内部模块边界，使用容量和故障数据决定后续拆分 |
| 实现风险 | 厂商 SNMP/LLDP/Trap 差异 | 模拟器加少量真实设备兼容性矩阵 |
| 实现风险 | 身份、乱序和重放造成历史污染 | 不可变 ID、Inbox 幂等、唯一约束、追加转换和人工确认 |
| 实现风险 | Condition/Health/Alert 版本漂移 | 原子发布、哈希对账、上一有效版本和审计 |
| 实现风险 | 时钟偏差影响 TOTP 和时序 | NTP、偏差监控、平台告警和恢复检查 |

真正阻塞建立脚手架和拆分 Tickets 的事项：无。

## 28. 实现顺序约束

| 编号 | 规范要求与适用对象 | 验收依据与失败条件 | 权威关联 |
| --- | --- | --- | --- |
| MVP-ARC-017 | 第一阶段必须先建立工作区、共享协议、API/Worker 独立入口、Go 进程、显式迁移入口和测试骨架，再进入业务模块。 | 首批 Ticket 依赖图；业务代码先于边界和契约且形成反向依赖，即失败。 | ARC-CODE |
| MVP-ARC-018 | 可靠事务、Inbox/Outbox/Job、幂等和审计上下文必须先于采集结果、Condition、Alert、Health 的异步链路。 | 集成顺序审查；业务消息先使用临时进程队列并形成迁移债务，即失败。 | ADR-0013、ARC-CODE |
| MVP-ARC-019 | 认证、RBAC、TOTP 和会话基线必须先于受保护管理页面和 SSE；不得以开发便利暂时跳过后端授权。 | Ticket 验收；页面上线时接口仍无后端权限检查，即失败。 | ADR-0005/0006/0007、ARC-CODE |
| MVP-ARC-020 | 资产身份和 `central-default` 必须先于 Observation；Observation/Fact 必须先于 Condition；Condition 必须先于 Alert 与 Health；Alert、Health 和 Topology 必须先于 Incident 自动关联与领导聚合。 | 依赖图和集成测试；下游模块通过临时重复逻辑绕过上游权威模型，即失败。 | ADR-0001/0002/0003/0009/0011/0012 |
| MVP-ARC-021 | 每个垂直切片必须同时包含失败处理、审计、权限、集成测试和部署可观测性；不得把安全、错误、测试和运行维护统一推迟到末期。 | Ticket 完成定义；核心路径只有 happy path 或无运行指标，即失败。 | AGENTS、ACC、Ponytail 最小实现原则 |
| MVP-ARC-022 | Monorepo 必须使用原生 npm workspaces 和一个根 Go module，固定顶层边界为 `apps/web`、`apps/platform`、`services/collector`、`packages/contracts` 及少量真正共享包；不得为任务编排引入 Nx、Turborepo 或重复构建框架。 | 工作区清单和依赖图；业务模块被搬入无边界 shared 包或出现第二工作区编排层，即失败。 | ARC-CODE |
| MVP-ARC-023 | 测试结构必须覆盖领域单元、模块应用测试、真实 PostgreSQL 集成、跨语言契约、进程端到端、恢复和 MVP-S1 容量层；数据库协调正确性不得只用内存替身证明。 | 测试目录和 CI 计划；关键锁、事务、幂等仅以 mock 测试验收，即失败。 | ARC-CODE、ACC、CAP-ACC |

建议的首轮序列：

1. 工作区与契约生成边界。
2. API、Worker、Go、迁移和测试启动骨架。
3. PostgreSQL 事务、Inbox、Outbox、Job 与审计关联。
4. 本地认证、RBAC、TOTP、会话和应急恢复。
5. 资产身份、`central-default`、受控导入和拓扑候选。
6. Observation → Normalized Fact → Condition 的最小纵切。
7. Health 与 Alert 的并列消费、vmalert 推送和对账。
8. Incident、运维工作台、领导大屏和容量加固。

ORM、日志库、TOTP 库、OpenAPI 生成器、迁移工具、Job 轮询间隔和具体函数/目录命名属于 Ticket 级实现选择；选择需遵循现有边界、依赖审查和最小实现原则。

## 29. 冲突解决记录

| 记录 | 冲突 | 权威处理 | 结果 |
| --- | --- | --- | --- |
| CR-001 | ADR-0005 曾把 TOTP 和具体会话机制列为待决 | 后续已接受 ADR-0006、ADR-0007 优先 | TOTP 和 PostgreSQL 不透明会话纳入 MVP 强制范围 |
| CR-002 | ADR-0009 曾把指标规则执行器列为待决 | 后续 ADR-0010 优先 | vmalert 执行指标型计算，平台实时推送加周期对账 |
| CR-003 | ADR-0010 以 Metric Alert Result 描述 vmalert 输出，ADR-0012 引入共享 Condition | 后续且更具体的 ADR-0012 优先，ADR-0010 保留执行器与对账边界 | vmalert 输出规范化为 Metric Condition Evaluation，Alert 和 Health 并列消费 |
| CR-004 | ARC-HLT 曾把 Alert evaluation 列为 Health Status 的消费者，形成与 ADR-0012 不一致的依赖暗示 | ADR-0012 优先 | ARC-HLT 已改为 Health 服务于拓扑、影响、大屏和报表；Alert 不由 Health 派生 |
| CR-005 | 早期示例目录使用 `apps/api`，代码库设计收敛为 `apps/platform` | 正式 ARC-CODE 优先 | 采用一个 NestJS 平台包，内含独立 `main.ts`、`worker.ts`、`migrate.ts` 入口 |
| CR-006 | 部署文档允许 Redis 在确认缓存需求后启用，本轮范围明确排除 Redis | 当前已决定的 MVP 范围和 ADR-0013 优先 | MVP 不运行 Redis；未来有实测需求时新 ADR |

未发现无法按权威优先级解决的冲突。

## 30. 后续版本候选能力

以下能力只在触发条件和新 ADR/规格变更成立后进入候选：

- 分布式 Collector/ProbeNode、mTLS、离线缓存补传、远程调度和多节点交叉探测。
- PostgreSQL 高可用、VictoriaMetrics 集群、双节点采集、负载均衡和跨机房灾备。
- 以 NATS JetStream 或其他 Broker 替代部分 PostgreSQL 协调。
- OIDC 统一身份、外部组织/组映射、IdP MFA 与 WebAuthn/FIDO2。
- 经安全审批的 Display Principal、Display Device 和无人值守 Display Session。
- Syslog、NetFlow、业务依赖扩展、流量安全分析和安全运营。
- 外部 ITSM/工单集成、排班和更完整的 Incident 协作。
- Alertmanager 作为出站通知适配器，但不改变平台权威 Alert/Incident。
- 更高 S2/S3 容量等级、多主机水平扩展和更长/分层指标保留。
- 更丰富的厂商堆叠识别、CMDB 受控集成和反钓鱼强认证器。

这些候选不构成当前 MVP 承诺。
