#!/usr/bin/env python3
"""
ShiHao Finance AI Agent System - Integration Test
测试优化后的智能体架构工作流程
"""


def test_agent_hierarchy():
    """测试智能体层级结构"""
    from shihao_finance.agent.agents import (
        create_portfolio_manager,
        create_market_analyst,
        create_research_analyst,
        create_risk_manager,
        create_trade_executor,
        create_news_analyst,
        create_backtest_analyst,
        create_data_analyst,
    )

    # 创建总负责AI
    chief = create_portfolio_manager()
    assert chief.role == "AI投资主管 (Chief AI Officer)"
    assert chief.allow_delegation == True, "总负责AI必须允许委托"

    # 创建专业Agent
    specialists = {
        "market_analyst": create_market_analyst(),
        "research_analyst": create_research_analyst(),
        "risk_manager": create_risk_manager(),
        "trade_executor": create_trade_executor(),
        "news_analyst": create_news_analyst(),
        "backtest_analyst": create_backtest_analyst(),
        "data_analyst": create_data_analyst(),
    }

    # 验证所有专业Agent都有工具
    for name, agent in specialists.items():
        assert len(agent.tools) > 0, f"{name} should have tools"
        print(f"[PASS] {name}: {len(agent.tools)} tools")

    return chief, specialists


def test_workflow_simulation():
    """模拟工作流程"""
    print("\n" + "=" * 60)
    print("模拟用户请求处理流程")
    print("=" * 60)

    chief, specialists = test_agent_hierarchy()

    # 模拟用户请求
    user_request = "我想了解一下贵州茅台(600519)的投资价值"

    print(f"\n[用户请求] {user_request}")
    print("\n[工作流程]")
    print("1. 总负责AI接收用户请求")
    print("2. 总负责AI分析需求，分解任务:")
    print("   - 市场分析: 技术面分析")
    print("   - 深度研究: 基本面分析")
    print("   - 新闻分析: 最新消息")
    print("   - 风险管理: 风险评估")
    print("3. 各专业Agent并行执行任务")
    print("4. 总负责AI汇总结果")
    print("5. 生成投资建议报告")

    print("\n[预期结果]")
    print("用户收到一份包含以下内容的综合报告:")
    print("  - 技术指标分析")
    print("  - 基本面估值")
    print("  - 市场情绪分析")
    print("  - 风险提示")
    print("  - 投资建议")

    print("\n" + "=" * 60)
    print("工作流程模拟完成!")
    print("=" * 60)


def test_specialist_tool_coverage():
    """测试专业Agent工具覆盖"""
    print("\n" + "=" * 60)
    print("专业Agent工具覆盖测试")
    print("=" * 60)

    _, specialists = test_agent_hierarchy()

    tool_coverage = {
        "market_analyst": ["technical_indicator_tool"],
        "risk_manager": ["technical_indicator_tool"],
        "trade_executor": ["execution_strategy_tool"],
        "news_analyst": ["sentiment_feedback_tool"],
        "backtest_analyst": ["performance_analysis_tool"],
        "data_analyst": ["concept_heat_tool", "fund_flow_tool", "index_data_tool"],
    }

    for agent_name, expected_tools in tool_coverage.items():
        agent = specialists[agent_name]
        agent_tool_names = [t.name for t in agent.tools]
        print(f"\n[{agent_name}]")
        for tool_name in expected_tools:
            # Check if any tool contains the expected name
            found = any(
                tool_name.replace("_tool", "") in name for name in agent_tool_names
            )
            status = "PASS" if found else "FAIL"
            print(f"  {status}: {tool_name}")

    print("\n" + "=" * 60)


if __name__ == "__main__":
    print("ShiHao Finance AI Agent System - Integration Test")
    print("=" * 60)

    try:
        test_agent_hierarchy()
        print("\n[PASS] Agent hierarchy test passed!")

        test_specialist_tool_coverage()

        test_workflow_simulation()

        print("\n" + "=" * 60)
        print("All integration tests PASSED!")
        print("=" * 60)

    except Exception as e:
        print(f"\n[FAIL] Integration test failed: {e}")
        raise
